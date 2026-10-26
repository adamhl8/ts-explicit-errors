import { expect } from "bun:test"

import { isErr } from "#result.ts"

export const throwsError = () => {
  throw new Error("sync error")
}

/** Returns a function that throws `value`, which may be a non-`Error`. */
export const throwing =
  (value: unknown): (() => void) =>
  () => {
    throw value
  }

export const expectErr: (value: unknown) => asserts value is Error = (value) => {
  expect(isErr(value)).toBe(true)
}
