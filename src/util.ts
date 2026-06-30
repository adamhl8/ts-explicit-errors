/**
 * @param {unknown} value The value to check
 * @returns {boolean} `true` if the value is a Promise (more specifically, a thenable)
 */
export const isPromiseLike = (value: unknown): value is PromiseLike<unknown> =>
  value && typeof value === "object" && "then" in value ? typeof value.then === "function" : false

/** Checks if union type U contains any type that is assignable to type T. */
export type Contains<U, T> = Extract<U, T> extends never ? false : true

// https://github.com/sindresorhus/type-fest/blob/main/source/simplify.d.ts
// oxlint-disable-next-line typescript/ban-types
export type Simplify<T> = { [KeyType in keyof T]: T[KeyType] } & {}
