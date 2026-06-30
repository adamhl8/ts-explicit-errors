import type { Result } from "#/result.ts"

type DefaultContext = Record<string, unknown>

/**
 * A custom error class that extends the built-in {@link Error} class with additional functionality.
 *
 * - All instances of `CtxError` are instances of `Error`, so using them in place of `Error` won't cause any issues.
 */
export class CtxError extends Error {
  // Note that we enforce the `Error` type for many properties, arguments, etc. That way the error chain is always a chain of `Error` or `CtxError` (since `CtxError` extends `Error`).

  /** The context object of the error. */
  public context?: DefaultContext
  /** The cause of the error. */
  public override cause?: Error // On a normal `Error`, `cause` is of type `unknown`. We explicitly want the `cause` on a `CtxError` to be an `Error`.

  public constructor(
    message: string,
    options?: {
      cause?: Error
    },
    /**
     * When the `attempt` function is used, we pass in the original error that was thrown so we can copy its properties
     * onto a new `CtxError` instance. - Passing this argument will cause the `message` and `options` properties to be
     * ignored.
     */
    errorToConvert?: Error,
    // oxlint-disable-next-line unicorn/custom-error-definition - Asks us to set the name. False positive, doesn't take into account our error conversion.
  ) {
    super()
    Object.setPrototypeOf(this, new.target.prototype)

    if (errorToConvert) {
      this.name = errorToConvert.name
      this.message = errorToConvert.message
      if (errorToConvert.cause instanceof Error) this.cause = errorToConvert.cause
      if (errorToConvert.stack) this.stack = errorToConvert.stack
    } else {
      this.name = "CtxError"
      this.message = message
      if (options?.cause) this.cause = options.cause
    }
  }

  /**
   * The full error message, which contains all of the error messages in the error chain (this error and all its
   * causes).
   *
   * - This is formatted as: `cause1 -> cause2 -> ... -> causeN`
   */
  public get messageChain(): string {
    const messages = [this.message]
    let currentCause = this.cause

    while (currentCause) {
      const causeMessage = CtxError.#prependErrorNameToMessage(currentCause)
      messages.push(causeMessage)
      currentCause = currentCause.cause instanceof Error ? currentCause.cause : undefined
    }

    const filteredMessages = messages.map((msg) => msg.trim()).filter(Boolean)
    const messageChain = filteredMessages.length > 0 ? filteredMessages.join(" -> ") : "Unknown error"

    return messageChain
  }

  /**
   * Prepends the error name to the error message if it's not 'Error' or 'CtxError'.
   *
   * @param {Error} error The error
   * @returns {string} The error message
   */
  static #prependErrorNameToMessage(error: Error): string {
    const shouldShowName = error.name !== "Error" && error.name !== "CtxError"
    const prefix = shouldShowName ? `${error.name}: ` : ""
    const errorMessage = `${prefix}${error.message}`
    return errorMessage
  }

  /**
   * Cleans a stack trace by removing internal frames.
   *
   * @param {string} stack The raw stack trace
   * @returns {string} The cleaned stack trace
   */
  static #cleanStack(stack: string): string {
    const stackLines = stack.trim().split("\n")

    const excludes = ["at new CtxError", "at err", "at attempt"]
    const cleanedLines = stackLines
      .map((line) => line.trim())
      .filter((line) => !excludes.some((exclude) => line.startsWith(exclude)))
    return cleanedLines.join("\n    ")
  }

  /**
   * The stack trace of the error chain.
   *
   * **Note:** This is the stack trace from the last/deepest error in the chain. This is probably what you want since
   * this gives you the full stack trace of the error chain.
   *
   * - If you want the stack trace of the current error, use `stack`.
   */
  public get rootStack() {
    const stacks = [this.stack]
    let currentCause = this.cause

    while (currentCause) {
      stacks.push(currentCause.stack)
      currentCause = currentCause.cause instanceof Error ? currentCause.cause : undefined
    }

    const filteredStacks = stacks.map((stack) => (stack ? stack.trim() : "")).filter(Boolean)
    const rootStack = filteredStacks.at(-1)

    return rootStack ? CtxError.#cleanStack(rootStack) : "<no stack>"
  }

  /**
   * Adds context to the error. If the error already has context, the new context will be merged over the existing
   * context.
   *
   * ```ts
   * ctxError.ctx({ requestId: "abc-123" })
   * console.log(ctxError.context) // { requestId: "abc-123" }
   * ```
   *
   * @param {DefaultContext} context The context to add
   * @returns {this} This error with context
   */
  public ctx(context: DefaultContext): this {
    this.context = { ...this.context, ...context }
    return this
  }

  /**
   * Retrieves a context value from the error chain (this error and all its causes), prioritizing the deepest value.
   *
   * @template T The expected type of the context value
   * @param {string} key The key to look up in the context
   * @returns {T | undefined} The context value if found, or `undefined` if not found
   */
  public get<T>(key: string): T | undefined {
    if (this.cause instanceof CtxError) {
      const deepestValue = this.cause.get<T>(key)
      if (deepestValue !== undefined) return deepestValue
    }

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    if (this.context && Object.hasOwn(this.context, key)) return this.context[key] as T

    return
  }

  /**
   * Retrieves all context values as an array for a given key from the entire error chain (this error and all its
   * causes).
   *
   * - Values are returned in order from shallowest (this error) to deepest (root cause)
   * - Unlike {@link get} which returns the deepest value, this returns all values as an array
   *
   * @param {string} key The key to look up in the context chain
   * @returns {T[]} An array of all context values found for the given key
   */
  public getAll<T>(key: string): T[] {
    const values: unknown[] = []

    if (this.context && Object.hasOwn(this.context, key)) values.push(this.context[key])

    if (this.cause instanceof CtxError) values.push(...this.cause.getAll(key))

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion
    return values as T[]
  }
}

/**
 * Checks if a value is an instance of {@link CtxError}.
 *
 * - This is a wrapper around `result instanceof CtxError` to make type narrowing more concise
 *
 * @param {Result<T>} result The value to check
 * @returns {boolean} `true` if the value is an instance of {@link CtxError}, otherwise `false`
 */
export const isErr = <T>(result: Result<T>): result is CtxError => result instanceof CtxError

/**
 * Takes a message and a cause and returns a new {@link CtxError}. - If there is no cause, you must explicitly pass
 * `undefined` as the cause.
 *
 * This is a wrapper around `new CtxError()` to make creating errors more concise
 *
 * @param {string} message The error message
 * @param {Error | undefined} cause The cause of the error
 * @returns {CtxError} A new {@link CtxError}
 */
export const err = (message: string, cause: Error | undefined): CtxError =>
  cause ? new CtxError(message, { cause }) : new CtxError(message)

type ErrFn = typeof err

/**
 * Creates a {@link err} function with predefined context.
 *
 * This is useful when you want to create multiple errors with the same context, such as a common scope or component
 * name.
 *
 * ```ts
 * const serviceErr = errWithCtx({ scope: "userService" })
 *
 * // Later in your code
 * if (isErr(result)) return serviceErr("failed to find user", result)
 * // The error will automatically have { scope: "userService" } in its context
 * ```
 *
 * @param {DefaultContext} defaultContext The default context to attach to all errors created by this function
 * @returns {ErrFn} A `err` function with predefined context
 */
export const errWithCtx =
  (defaultContext: DefaultContext): ErrFn =>
  (message, cause) =>
    err(message, cause).ctx(defaultContext)
