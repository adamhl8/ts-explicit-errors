type Context = Record<string, unknown>

// Use `Symbol.for` so errors from another installed copy of the library are recognized too.
const marker = Symbol.for("ts-explicit-errors.err")

/**
 * Creates an `Error` with a message, an optional cause, and optional context.
 *
 * - If there is no cause, you must explicitly pass `undefined` as the cause
 * - Context is readable with `getContext` and `getAllContext`
 *
 * ```ts
 * if (isErr(user)) return err("failed to find user", user, { userId: id })
 * ```
 *
 * @param {string} message The error message
 * @param {Error | undefined} cause The cause of the error
 * @param {Context} [context] The context to attach to the error
 * @returns {Error} A new `Error`
 */
export const err = (message: string, cause: Error | undefined, context?: Context): Error => {
  const error = cause ? new Error(message, { cause }) : new Error(message)
  Object.defineProperty(error, marker, { value: true })
  if (context) Object.assign(error, { context: { ...context } })
  return error
}

type ErrFn = typeof err

/**
 * Creates an {@link err} function with predefined context, such as a common scope or component name.
 *
 * - Context passed to the returned function is merged over the predefined context
 *
 * ```ts
 * const serviceErr = errWithCtx({ scope: "userService" })
 * if (isErr(user)) return serviceErr("failed to find user", user, { userId: id })
 * ```
 *
 * @param {Context} defaultContext The context to attach to every error created by the returned function
 * @returns {ErrFn} An `err` function with predefined context
 */
export const errWithCtx =
  (defaultContext: Context): ErrFn =>
  (message, cause, context) =>
    err(message, cause, { ...defaultContext, ...context })

type ErrorWithContext = Error & { context: Context }

/** Checks if an error was created by {@link err} with context. */
export const isErrorWithContext = (error: Error): error is ErrorWithContext =>
  Object.hasOwn(error, marker) && "context" in error && typeof error.context === "object" && error.context !== null
