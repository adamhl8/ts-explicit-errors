/**
 * Represents a value or an `Error`.
 *
 * The main idea is that **when you would normally write a function that returns `T`, you should instead return
 * `Result<T>`.**
 *
 * - If your function doesn't return anything (i.e. `undefined`) other than an error, you can use `Result` without a type
 *   argument since `void` is the default
 */
export type Result<T = void> = T | Error

// Catch here because `instanceof` throws for a revoked `Proxy`.
const isErrorInstance = (value: unknown) => {
  try {
    return value instanceof Error
  } catch {
    return false
  }
}

// Check for `Error.isError` because older runtimes, such as some browsers, don't have it.
const hasIsError = typeof Error.isError === "function"

/**
 * Checks if a value is an `Error`.
 *
 * @param {unknown} value The value to check
 * @returns {boolean} `true` if the value is an `Error`, otherwise `false`
 */
export const isErr = (value: unknown): value is Error =>
  // Check both ways because Bun's `Error.isError` rejects `DOMException`, and `instanceof` rejects errors from other realms.
  (hasIsError && Error.isError(value)) || isErrorInstance(value)
