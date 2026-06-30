// oxlint-disable no-throw-literal typescript/only-throw-error
import { expect } from "vitest"

import { isErr } from "#/ctx-error.ts"
import type { CtxError } from "#/ctx-error.ts"
import type { Result } from "#/result.ts"

export const throwsError = () => {
  throw new Error("sync error")
}

export const throwsString = () => {
  throw "string error"
}

export const expectErr: <T>(result: Result<T>) => asserts result is CtxError = (result) => {
  expect(isErr(result)).toBe(true)
}
