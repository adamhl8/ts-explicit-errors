/**
 * Represents a tuple that contains a value and an error
 *
 * If the value is present, the error is `null`
 *
 * Conversely, if the error is present, the value is `null`
 */
type Result<T> = [T, null] | [null, Error]

/**
 * Creates a new `Error` from an unknown value
 *
 * Returns the original `Error` if it is already an instance of `Error`
 *
 * Otherwise, creates a new `Error` with the value converted to a string
 */
function newError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * Takes a message and optionally a cause, and returns a new Error with a nicely formatted message
 *
 * All nested errors (i.e. errors attached as `cause`) are unwrapped and included in the final error message
 *
 * The final error message is formatted as `message -> cause1 -> cause2 -> ... -> causeN`
 *
 * Example:
 *
 * ```ts
 * const [file, err] = attempt(() => fs.readFileSync("non-existent.json"))
 * if (err) {
 *   const error = fmtError("failed to read file", err)
 *   console.error(error.message)
 *   // failed to read file -> ENOENT: no such file or directory, open 'non-existent.json'
 * }
 * ```
 */
function fmtError(message: string, cause?: unknown): Error {
  const causeMessages: string[] = []
  /*
   * If cause is an instance of Error, use it directly
   * Otherwise, if cause is a truthy value, create a new Error from it
   * This is so we can handle cases where the caller passes in a string or other non-Error value as the cause
   */
  let nextCause = cause instanceof Error ? cause : cause ? newError(cause) : undefined
  while (nextCause) {
    // Only show the name if it's not "Error"
    const causeMessage = `${nextCause.name === "Error" ? "" : `${nextCause.name}: `}${nextCause.message}`
    causeMessages.push(causeMessage)
    nextCause = nextCause.cause ? newError(nextCause.cause) : undefined
  }

  const fullCauseMessage = causeMessages.join(" -> ")
  const errorMessage = fullCauseMessage ? `${message} -> ${fullCauseMessage}` : message
  const error = new Error(errorMessage)

  return error
}

/**
 * Checks if a value is a Promise (more specifically, a thenable)
 */
function isPromise(value: any): value is Promise<any> {
  return value ? typeof value.then === "function" : false
}

/**
 * Executes a function, catches any errors thrown, and returns a `Result`, which is a tuple of the value or the error
 *
 * If the value is present, the error is `null`
 *
 * Conversely, if the error is present, the value is `null`
 *
 * The function can be either synchronous or asynchronous
 *
 * If the function is async / returns a Promise, the returned `Result` will be a `Promise` and should be `await`ed
 *
 * Otherwise, it will return `Result` directly
 *
 * Example:
 *
 * ```ts
 * const [file, err] = attempt(() => fs.readFileSync("non-existent.json"))
 * if (err) {
 *   return [null, fmtError("failed to read file", err)]
 * }
 * // do something with `file`
 * ```
 */
function attempt<T>(fn: () => Promise<T>): Promise<Result<T>>
function attempt<T>(fn: () => T): Result<T>
function attempt<T>(fn: () => Promise<T> | T) {
  try {
    const result = fn()
    if (isPromise(result)) {
      return result.then((value) => [value, null] as const).catch((error: unknown) => [null, newError(error)] as const)
    }
    return [result, null] as const
  } catch (error) {
    return [null, newError(error)] as const
  }
}

export { attempt, fmtError }
export type { Result }
