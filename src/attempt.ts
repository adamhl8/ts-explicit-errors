import type { Result } from "#result.ts"
import { isErr } from "#result.ts"
import { isPromiseLike } from "#util.ts"

// Fall back to `Object.prototype.toString` because `String()` throws for values like `Object.create(null)`.
// Fall back again to a constant because both throw for a revoked `Proxy`.
const describeUnknown = (value: unknown) => {
  try {
    return String(value)
  } catch {
    try {
      return Object.prototype.toString.call(value)
    } catch {
      return "Unknown error"
    }
  }
}

const toError = (value: unknown) => (isErr(value) ? value : new Error(describeUnknown(value), { cause: value }))

/**
 * Executes a function, _catches any errors thrown_, and returns the value or the thrown error.
 *
 * **It is generally used for functions that _you don't control_ which might throw an error**.
 *
 * - The thrown error is returned unchanged, so its own properties, methods, and `instanceof` still work
 * - A thrown non-`Error` value is returned as an `Error` whose `cause` is the original value
 * - Wrap the error with `err()` to give it a message that says what you were doing
 * - Use `attempt` as far down the call stack as possible so that thrown errors are handled at their source
 *
 * @param fn The function to execute
 * @returns A {@link Result}: the value, or the thrown error
 */
export function attempt<T>(fn: () => Promise<T>): Promise<Result<T>>
export function attempt<T>(fn: () => T): Result<T>
export function attempt<T>(fn: () => Promise<T> | T) {
  try {
    const result = fn()
    return isPromiseLike(result)
      ? // oxlint-disable-next-line promise/prefer-await-to-then promise/prefer-await-to-callbacks - `attempt` stays synchronous for a synchronous `fn`, so it can't be async.
        result.then((value) => value).catch((error: unknown) => toError(error))
      : result
  } catch (error) {
    return toError(error)
  }
}
