import { isErrorWithContext } from "#err.ts"
import { isErr } from "#result.ts"

/** Lists the error and each `cause` below it, stopping at the first `cause` that isn't an `Error`. */
const getErrorChain = (error: Error): Error[] => {
  const chain: Error[] = [error]
  let current: unknown = error.cause
  while (isErr(current)) {
    chain.push(current)
    current = current.cause
  }
  return chain
}

// Read these as `unknown` because a foreign error can redefine them as non-strings.
const getStringProperty = (error: Error, key: "message" | "name" | "stack"): string => {
  const value: unknown = error[key]
  return typeof value === "string" ? value.trim() : ""
}

const describeError = (error: Error): string => {
  const message = getStringProperty(error, "message")
  const name = getStringProperty(error, "name")
  return message && name && name !== "Error" ? `${name}: ${message}` : message
}

/**
 * Joins the messages of the error and all its causes, formatted as `message -> cause1 -> ... -> causeN`.
 *
 * - Messages are prefixed with the error's name when it isn't `Error`, e.g. `SyntaxError: ...`
 * - Blank messages are skipped
 *
 * @param {Error} error The error
 * @returns {string} The message chain, or `"Unknown error"` if every message is blank
 */
export const messageChain = (error: Error): string => {
  const messages = getErrorChain(error).map(describeError).filter(Boolean)
  return messages.length > 0 ? messages.join(" -> ") : "Unknown error"
}

// Match up to the "(" so user functions like `errorHandler` or `attemptLogin` keep their frames.
const internalFrames = ["at err (", "at attempt ("]

/**
 * Returns the stack trace of the deepest error in the chain, which is usually the most useful one, with internal frames
 * removed.
 *
 * @param {Error} error The error
 * @returns {string} The root stack trace, or `"<no stack>"` if no error in the chain has one
 */
export const rootStack = (error: Error): string => {
  const stack = getErrorChain(error)
    .map((link) => getStringProperty(link, "stack"))
    .findLast(Boolean)
  if (!stack) return "<no stack>"

  return stack
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !internalFrames.some((frame) => line.startsWith(frame)))
    .join("\n    ")
}

/**
 * Returns every context value for `key` in the chain, from shallowest (this error) to deepest (root cause).
 *
 * @param {Error} error The error
 * @param {string} key The context key
 * @returns {T[]} The context values
 */
export const getAllContext = <T>(error: Error, key: string): T[] => {
  const values = getErrorChain(error).flatMap((link) =>
    isErrorWithContext(link) && Object.hasOwn(link.context, key) ? [link.context[key]] : [],
  )
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion - The caller picks the type of the context values with `T`.
  return values as T[]
}

/**
 * Returns the deepest context value for `key` in the chain that isn't `undefined`.
 *
 * @param {Error} error The error
 * @param {string} key The context key
 * @returns {T | undefined} The context value, or `undefined` if no error in the chain has one
 */
// oxlint-disable-next-line typescript/no-unnecessary-type-parameters - The caller picks the type of the context value with `T`.
export const getContext = <T>(error: Error, key: string): T | undefined =>
  getAllContext<T>(error, key).findLast((value) => value !== undefined)

/**
 * Finds the first error in the chain, starting with `error` itself, that is an instance of `ErrorClass`.
 *
 * ```ts
 * const shellError = findCause(error, $.ShellError)
 * if (shellError) console.error(shellError.exitCode)
 * ```
 *
 * @param {Error} error The error
 * @param {abstract new (...args: never[]) => E} ErrorClass The error class to match
 * @returns {E | undefined} The shallowest matching error, or `undefined` if none match
 */
export const findCause = <E extends Error>(
  error: Error,
  ErrorClass: abstract new (...args: never[]) => E,
): E | undefined => getErrorChain(error).find((link): link is E => link instanceof ErrorClass)
