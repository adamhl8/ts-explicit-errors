/**
 * Represents a tuple that contains a value or an error.
 *
 * - If the value is present, the error is `undefined`
 * - Conversely, if the error is present, the value is `undefined`
 *
 * The main idea is that **when you would normally write a function that returns `T`, you should instead return `Result<T>`.**
 *
 * - Functions that don't return anything (i.e. `undefined`) should use the {@link Err} type instead.
 *
 * Instead of this:
 *
 * ```ts
 * function divide(a: number, b: number): number {
 *   if (b === 0) {
 *     throw new Error("division by zero")
 *   }
 *   return a / b
 * }
 *
 * try {
 *   const result = divide(10, 0)
 *   console.log(result)
 * } catch (err) {
 *   console.error("failed to divide", err)
 * }
 * ```
 *
 * Use `Result`:
 *
 * ```ts
 * function divide(a: number, b: number): Result<number> {
 *   if (b === 0) {
 *     return [undefined, fmtError("division by zero")]
 *   }
 *   return [a / b, undefined]
 * }
 *
 * const [result, err] = divide(10, 0)
 * if (err) {
 *   console.error(fmtError("failed to divide", err))
 * } else {
 *   console.log(result)
 * }
 * ```
 */
type Result<T> = [T, undefined] | [undefined, Error]

/**
 * A type alias for `Error | undefined` to make function return types more readable.
 *
 * - This is used for functions that don't return a value but may return an error.
 *
 * ```ts
 * function validateData(data: string): Err {
 *   if (data.length < 10) {
 *     return fmtError("data is too short")
 *   }
 *   // implicit return undefined
 * }
 *
 * const err = validateData("short")
 * if (err) {
 *   console.error(fmtError("failed to validate data", err))
 * }
 * ```
 */
type Err = Error | undefined

/**
 * @param error The value to convert to an `Error`
 * @returns The original `Error` if it is already an instance of `Error`. Otherwise, creates a new `Error` with the value converted to a string
 */
function newError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error))
}

/**
 * @param message The error message
 * @param cause The cause of the error (optional)
 * @returns A new `Error` with a nicely formatted message
 *
 * - All nested errors (i.e. errors attached as `cause`) are unwrapped and included in the final error message
 * - The error message is formatted as: `message -> cause1 -> cause2 -> ... -> causeN`
 * @example
 * ```ts
 * function doTheFirstThing(): Result<string> {
 *   // throws an error with the message "something went wrong"
 * }
 *
 * function doTheSecondThing(): Result<string> {
 *   const [data, err] = doTheFirstThing()
 *   if (err) {
 *     return [undefined, fmtError("failed to do the first thing", err)]
 *   }
 *   // do something with `data`...
 *   return [data, undefined]
 * }
 *
 * const [data, err] = doTheSecondThing()
 * if (err) {
 *   const error = fmtError("failed to do the second thing", err)
 *   console.error(error.message)
 *   // failed to do the second thing -> failed to do the first thing -> something went wrong
 * }
 * ```
 *
 * As stated above, the `cause` is optional, because sometimes you need create your own error.
 *
 * ```ts
 * const [data, err] = getData()
 * if (err) {
 *   // handle error
 * }
 * if (data.length < 10) {
 *   const error = fmtError("data is too short")
 *   return [undefined, error]
 * }
 * ```
 */
function fmtError(message: string, cause?: unknown): Error {
  const causeMessages: string[] = []
  /*
   * Make sure cause is an instance of Error
   * This is so we can handle cases where the caller passes in a string or other non-Error value as the cause
   */
  let nextCause = cause ? newError(cause) : undefined
  while (nextCause) {
    // Only show the name if it's not "Error"
    const prefix = nextCause.name === "Error" ? "" : `${nextCause.name}: `
    const causeMessage = `${prefix}${nextCause.message}`
    causeMessages.push(causeMessage)
    nextCause = nextCause.cause ? newError(nextCause.cause) : undefined
  }

  const fullCauseMessage = causeMessages.join(" -> ")
  const errorMessage = fullCauseMessage ? `${message} -> ${fullCauseMessage}` : message
  const error = newError(errorMessage)

  return error
}

/**
 * @param value The value to check
 * @returns `true` if the value is a Promise (more specifically, a thenable)
 */
function isPromise(value: any): value is Promise<any> {
  return value ? typeof value.then === "function" : false
}

/**
 * @param fn The function to execute
 * @returns A {@link Result}
 * @description
 * Executes a function, _catches any errors thrown_, and returns a {@link Result}.
 *
 * **It is generally used for functions that _you don't control_ which might throw an error**.
 *
 * - Use `attempt` to "force" functions to return a `Result` so error handling remains consistent
 * - Another way to think about this is that `attempt` should be used as far down the call stack as possible so that thrown errors are handled at their source
 *
 * ```ts
 * // in some function that returns a Result
 * const [file, err] = attempt(() => fs.readFileSync("non-existent.json"))
 * if (err) {
 *   return [undefined, fmtError("failed to read file", err)]
 * }
 * // do something with `file`
 * ```
 *
 * The function can be either synchronous or asynchronous.
 *
 * - If the function is async / returns a Promise, the returned `Result` will be a `Promise` and should be `await`ed
 *
 * ```ts
 * // fs.readFile returns a Promise
 * const [file, err] = await attempt(() => fs.readFile("file.txt"))
 * ```
 *
 * In the case where a function doesn't return anything (i.e. `undefined`) but might fail, you can simply ignore the first element of the `Result`.
 *
 * ```ts
 * const [, err] = attempt(() => fs.rmSync("non-existent.txt"))
 * if (err) {
 *   console.error(fmtError("failed to remove file", err))
 * }
 * ```
 */
function attempt<T>(fn: () => Promise<T>): Promise<Result<T>>
function attempt<T>(fn: () => T): Result<T>
function attempt<T>(fn: () => Promise<T> | T) {
  try {
    const result = fn()
    if (isPromise(result)) {
      return result
        .then((value) => [value, undefined] as const)
        .catch((error: unknown) => [undefined, newError(error)] as const)
    }
    return [result, undefined] as const
  } catch (error) {
    return [undefined, newError(error)] as const
  }
}

export { attempt, fmtError }
export type { Result, Err }
