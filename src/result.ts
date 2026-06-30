import type { CtxError } from "#/ctx-error.ts"

/**
 * Represents a value or a {@link CtxError}.
 *
 * The main idea is that **when you would normally write a function that returns `T`, you should instead return
 * `Result<T>`.**
 *
 * - If your function doesn't return anything (i.e. `undefined`) other than an error, you can use `Result` without a type
 *   argument since `void` is the default
 */
export type Result<T = void> = T | CtxError
