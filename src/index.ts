/**
 * A custom error class that extends the built-in {@link Error} class with additional functionality.
 *
 * - All instances of `CtxError` are instances of `Error`, so using them in place of `Error` won't cause any issues.
 */
class CtxError extends Error {
  public context?: Record<string, unknown>

  public constructor(message: string, options?: { cause?: unknown; context?: Record<string, unknown> }) {
    super(message, { cause: options?.cause })
    this.name = "CtxError"

    if (options?.context) this.context = { ...options.context }

    Object.setPrototypeOf(this, new.target.prototype)
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
  public ctx(context: Record<string, unknown>): this {
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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-parameters
  public get<T>(key: string): T | undefined {
    if (this.cause instanceof CtxError) {
      const deepestValue = this.cause.get<T>(key)
      if (deepestValue !== undefined) return deepestValue
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
    if (this.context && Object.hasOwn(this.context, key)) return this.context[key] as T

    return undefined
  }

  /**
   * Returns a nicely formatted error message by unwrapping all error messages in the error chain (this error and all its causes).
   *
   * - The error message is formatted as: `message -> cause1 -> cause2 -> ... -> causeN`
   * - An optional message can be provided which will be the first message in the string
   *
   * @param message The message to prepend to the error message (optional)
   * @returns A formatted error message string
   */
  public fmtErr(message?: string): string {
    const messages = [message, this.message]
    let currentCause = this.cause
    // Unwrap all nested error messages
    while (currentCause) {
      if (currentCause instanceof Error) {
        const shouldShowName = currentCause.name !== "Error" && currentCause.name !== "CtxError"
        const prefix = shouldShowName ? `${currentCause.name}: ` : ""
        const causeMessage = `${prefix}${currentCause.message}`
        messages.push(causeMessage)
        // eslint-disable-next-line @typescript-eslint/no-base-to-string
      } else messages.push(currentCause.toString())

      currentCause = currentCause instanceof Error ? currentCause.cause : undefined
    }

    const filteredMessages = messages.filter((msg) => msg?.trim())
    const errorMessage = filteredMessages.length > 0 ? filteredMessages.join(" -> ") : "Unknown error"

    return errorMessage
  }
}

/**
 * Takes a message and a cause (optional) and returns a new {@link CtxError}.
 *
 * - This is a wrapper around `new CtxError()` to make creating errors more concise
 *
 * @param message The error message
 * @param cause The cause of the error (optional)
 * @returns A new {@link CtxError}
 */
function err(message: string, cause?: unknown): CtxError {
  return new CtxError(message, { cause })
}

/**
 * Represents a tuple that contains a value or an error.
 *
 * - If the value is present, the error is `undefined`
 * - Conversely, if the error is present, the value is `undefined`
 *
 * The main idea is that **when you would normally write a function that returns `T`, you should instead return `Result<T>`.**
 *
 * - Functions that don't return anything (i.e. `undefined`) should use the {@link Err} type instead.
 */
type Result<T> = [T, undefined] | [undefined, CtxError]

/**
 * A type alias for `CtxError | undefined` to make function return types more readable.
 *
 * - This is used for functions that don't return a value but may return an error.
 */
type Err = CtxError | undefined

/**
 * @param value The value to check
 * @returns `true` if the value is a Promise (more specifically, a thenable)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isPromise(value: any): value is Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  return value ? typeof value.then === "function" : false
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
function attempt<T>(fn: () => Promise<T>): Promise<Result<T>>
function attempt<T>(fn: () => T): Result<T>
function attempt<T>(fn: () => Promise<T> | T) {
  try {
    const result = fn()
    if (isPromise(result)) {
      return result
        .then((value) => [value, undefined] as const)
        .catch((error: unknown) => [undefined, err("", error)] as const)
    }
    return [result, undefined] as const
  } catch (error) {
    return [undefined, err("", error)] as const
  }
}

export { attempt, err }
export type { Result, Err }
