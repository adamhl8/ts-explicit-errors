import { CtxError } from "#/ctx-error.ts"
import type { Result } from "#/result.ts"
import { isPromiseLike } from "#/util.ts"

const convertUnknownErrorToCtxError = (error: unknown) => {
  const newError = error instanceof Error ? error : new Error(String(error))
  return new CtxError("", {}, newError)
}

/**
 * Executes a function, _catches any errors thrown_, and returns a {@link Result}.
 *
 * **It is generally used for functions that _you don't control_ which might throw an error**.
 *
 * - Use `attempt` to "force" functions to return a `Result` so error handling remains consistent
 * - Another way to think about this is that `attempt` should be used as far down the call stack as possible so that
 *   thrown errors are handled at their source
 *
 * @param fn The function to execute
 * @returns A {@link Result}
 */
export function attempt<T>(fn: () => Promise<T>): Promise<Result<T>>
export function attempt<T>(fn: () => T): Result<T>
export function attempt<T>(fn: () => Promise<T> | T) {
  try {
    const result = fn()
    return isPromiseLike(result)
      ? // oxlint-disable-next-line promise/prefer-await-to-then promise/prefer-await-to-callbacks
        result.then((value) => value).catch((error: unknown) => convertUnknownErrorToCtxError(error))
      : result
  } catch (error) {
    return convertUnknownErrorToCtxError(error)
  }
}
