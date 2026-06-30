// oxlint-disable typescript/require-await no-throw-literal unicorn/no-null typescript/only-throw-error
import { describe, expect, it } from "vitest"

import { expectErr, throwsError, throwsString } from "#/__tests__/helpers.ts"
import { attempt } from "#/attempt.ts"
import { isErr } from "#/ctx-error.ts"

describe("attempt", () => {
  it("handles successful synchronous operations", () => {
    const result = attempt(() => "success")

    expect(isErr(result)).toBe(false)
    expect(result).toBe("success")
  })

  it("handles failed synchronous operations", () => {
    const result = attempt(() => {
      throwsError()
    })

    expectErr(result)

    expect(result.messageChain).toBe("sync error")
  })

  it("handles successful async operations", async () => {
    const result = await attempt(async () => "async success")

    expect(isErr(result)).toBe(false)
    expect(result).toBe("async success")
  })

  it("handles failed async operations", async () => {
    const result = await attempt(async () => {
      throw new Error("async error")
    })

    expectErr(result)

    expect(result.messageChain).toBe("async error")
  })

  it("handles non-Error throws", () => {
    const result = attempt(() => {
      throwsString()
    })
    expectErr(result)
    expect(result.messageChain).toBe("string error")

    const nullResult = attempt(() => {
      throw null
    })
    expectErr(nullResult)
    expect(nullResult.messageChain).toBe("null")

    const undefinedResult = attempt(() => {
      throw undefined
    })
    expectErr(undefinedResult)
    expect(undefinedResult.messageChain).toBe("undefined")
  })
})
