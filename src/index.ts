type DefaultContext = Record<string, unknown>

/**
 * Represents a value or a {@link CtxError}.
 *
 * The main idea is that **when you would normally write a function that returns `T`, you should instead return `Result<T>`.**
 *
 * - If your function doesn't return anything (i.e. `undefined`) other than an error, you can use `Result` without a type argument since `void` is the default
 */
export type Result<T = void> = T | CtxError

/**
 * Checks if a value is an instance of {@link CtxError}.
 *
 * - This is a wrapper around `result instanceof CtxError` to make type narrowing more concise
 *
 * @param result The value to check
 * @returns `true` if the value is an instance of {@link CtxError}, otherwise `false`
 */
export function isErr<T>(result: Result<T>): result is CtxError {
  return result instanceof CtxError
}

/**
 * Executes a function, _catches any errors thrown_, and returns a {@link Result}.
 *
 * **It is generally used for functions that _you don't control_ which might throw an error**.
 *
 * - Use `attempt` to "force" functions to return a `Result` so error handling remains consistent
 * - Another way to think about this is that `attempt` should be used as far down the call stack as possible so that thrown errors are handled at their source
 *
 * @param fn The function to execute
 * @returns A {@link Result}
 */
export function attempt<T>(fn: () => Promise<T>): Promise<Result<T>>
export function attempt<T>(fn: () => T): Result<T>
export function attempt<T>(fn: () => Promise<T> | T) {
  const convertUnknownErrorToCtxError = (error: unknown) => {
    const newError = error instanceof Error ? error : new Error(String(error))
    return new CtxError("", {}, newError)
  }

  try {
    const result = fn()
    return isPromiseLike(result)
      ? result.then((value) => value).catch((error: unknown) => convertUnknownErrorToCtxError(error))
      : result
  } catch (error) {
    return convertUnknownErrorToCtxError(error)
  }
}

/**
 * Takes a message and a cause and returns a new {@link CtxError}.
 * - If there is no cause, you must explicitly pass `undefined` as the cause.
 *
 * This is a wrapper around `new CtxError()` to make creating errors more concise
 *
 * @param message The error message
 * @param cause The cause of the error
 * @returns A new {@link CtxError}
 */
export function err(message: string, cause: Error | undefined): CtxError {
  return cause ? new CtxError(message, { cause }) : new CtxError(message)
}

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
     * When the `attempt` function is used, we pass in the original error that was thrown so we can copy its properties onto a new `CtxError` instance.
     * - Passing this argument will cause the `message` and `options` properties to be ignored.
     */
    errorToConvert?: Error,
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
   * The full error message, which contains all of the error messages in the error chain (this error and all its causes).
   *
   * - This is formatted as: `cause1 -> cause2 -> ... -> causeN`
   */
  public get messageChain(): string {
    const messages = [this.message]
    let currentCause = this.cause

    while (currentCause) {
      const causeMessage = this.#prependErrorNameToMessage(currentCause)
      messages.push(causeMessage)
      currentCause = currentCause.cause instanceof Error ? currentCause.cause : undefined
    }

    const filteredMessages = messages.map((msg) => msg.trim()).filter(Boolean)
    const messageChain = filteredMessages.length > 0 ? filteredMessages.join(" -> ") : "Unknown error"

    return messageChain
  }

  /**
   *
   * Prepends the error name to the error message if it's not 'Error' or 'CtxError'.
   *
   * @param error The error
   * @returns The error message
   */
  #prependErrorNameToMessage(error: Error): string {
    const shouldShowName = error.name !== "Error" && error.name !== "CtxError"
    const prefix = shouldShowName ? `${error.name}: ` : ""
    const errorMessage = `${prefix}${error.message}`
    return errorMessage
  }

  /**
   * The stack trace of the error chain.
   *
   * **Note:** This is the stack trace from the last/deepest error in the chain. This is probably what you want since this gives you the full stack trace of the error chain.
   * - If you want the stack trace of the current error, use `stack`.
   */
  public get rootStack() {
    const cleanStack = (stack: string) => {
      const stackLines = stack.trim().split("\n")

      const excludes = ["at new CtxError", "at err", "at attempt"]
      const cleanedLines = stackLines
        .map((line) => line.trim())
        .filter((line) => !excludes.some((exclude) => line.startsWith(exclude)))
      return cleanedLines.join("\n    ")
    }

    const stacks = [this.stack]
    let currentCause = this.cause

    while (currentCause) {
      stacks.push(currentCause.stack)
      currentCause = currentCause.cause instanceof Error ? currentCause.cause : undefined
    }

    const filteredStacks = stacks.map((stack) => (stack ? stack.trim() : "")).filter(Boolean)
    const rootStack = filteredStacks.at(-1)

    return rootStack ? cleanStack(rootStack) : "<no stack>"
  }

  /**
   * Adds context to the error. If the error already has context, the new context will be merged over the existing context.
   *
   * ```ts
   * ctxError.ctx({ requestId: "abc-123" })
   * console.log(ctxError.context) // { requestId: "abc-123" }
   * ```
   *
   * @param context The context to add
   * @returns This error with context
   */
  public ctx(context: DefaultContext): this {
    this.context = { ...this.context, ...context }
    return this
  }

  /**
   * Retrieves a context value from the error chain (this error and all its causes), prioritizing the deepest value.
   *
   * @template T The expected type of the context value
   * @param key The key to look up in the context
   * @returns The context value if found, or `undefined` if not found
   */
  public get<T>(key: string): T | undefined {
    if (this.cause instanceof CtxError) {
      const deepestValue = this.cause.get<T>(key)
      if (deepestValue !== undefined) return deepestValue
    }

    if (this.context && Object.hasOwn(this.context, key)) return this.context[key] as T

    return
  }

  /**
   * Retrieves all context values as an array for a given key from the entire error chain (this error and all its causes).
   *
   * - Values are returned in order from shallowest (this error) to deepest (root cause)
   * - Unlike {@link get} which returns the deepest value, this returns all values as an array
   *
   * @param key The key to look up in the context chain
   * @returns An array of all context values found for the given key
   */
  public getAll<T>(key: string): T[] {
    const values: unknown[] = []

    if (this.context && Object.hasOwn(this.context, key)) values.push(this.context[key])

    if (this.cause instanceof CtxError) values.push(...this.cause.getAll(key))

    return values as T[]
  }
}

/**
 * Creates a {@link err} function with predefined context.
 *
 * This is useful when you want to create multiple errors with the same context, such as a common scope or component name.
 *
 * ```ts
 * const serviceErr = errWithCtx({ scope: "userService" });
 *
 * // Later in your code
 * if (isErr(result)) return serviceErr("failed to find user", result);
 * // The error will automatically have { scope: "userService" } in its context
 * ```
 *
 * @param defaultContext The default context to attach to all errors created by this function
 * @returns A `err` function with predefined context
 */
export function errWithCtx(defaultContext: DefaultContext) {
  return (message: string, cause: Error | undefined): CtxError => err(message, cause).ctx(defaultContext)
}

type FilterMapResultValue<R> = Exclude<Awaited<R>, CtxError | undefined>

interface FilterMapResult<R> {
  values: FilterMapResultValue<R>[]
  errors: CtxError[] | undefined
}

type FilterMapReturn<R> =
  // If R (the return type of the given fn) contains a Promise
  Contains<R, PromiseLike<unknown>> extends true
    ? // then we return a Promise where all the values have been awaited
      Promise<Simplify<FilterMapResult<R>>>
    : // otherwise, we return a synchronous result
      Simplify<FilterMapResult<R>>

/**
 * Maps over an array, calling the provided function on each element. Returns an object containing the mapped elements array (`values`) and `errors` array (if any).
 *
 * - Returning `undefined` in the function excludes that element from the `values` array.
 * - Returning a {@link CtxError} (usually via {@link err}) collects the error into the `errors` array.
 *
 * @param items - Array to map over
 * @param fn - The function to execute for each element
 * @returns Object containing values array and optional errors array
 */
export function filterMap<T, R>(items: T[], fn: (item: T, index: number) => R): FilterMapReturn<R> {
  const mappedItems = items.map((item, index) => fn(item, index))

  const handleItems = (awaitedItems: Awaited<R>[]) => {
    const errors: CtxError[] = []

    const filteredItems = awaitedItems.filter((item): item is FilterMapResultValue<R> => {
      if (item === undefined) return false

      if (isErr(item)) {
        errors.push(item)
        return false
      }

      return true
    })

    return {
      values: filteredItems,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  const result = mappedItems.some(isPromiseLike)
    ? // If any item is a Promise, we await all of them
      Promise.all(mappedItems).then((resolvedResults) => handleItems(resolvedResults))
    : // We know at this point that all the return values are not wrapped in Promise (equivalent to Awaited<R>[])
      handleItems(mappedItems as Awaited<R>[])

  return result as FilterMapReturn<R>
}

/**
 * @param value The value to check
 * @returns `true` if the value is a Promise (more specifically, a thenable)
 */
function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return value && typeof value === "object" && "then" in value ? typeof value.then === "function" : false
}

/** Checks if union type U contains any type that is assignable to type T. */
type Contains<U, T> = Extract<U, T> extends never ? false : true

// https://github.com/sindresorhus/type-fest/blob/main/source/simplify.d.ts
type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {}
