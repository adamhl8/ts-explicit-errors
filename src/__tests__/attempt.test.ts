import { describe, expect, it } from "bun:test"

import { expectErr, throwsError, throwsString } from "#__tests__/helpers.ts"
import { attempt } from "#attempt.ts"
import { isErr } from "#ctx-error.ts"

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
    // oxlint-disable-next-line typescript/require-await - `attempt` must handle async functions.
    const result = await attempt(async () => "async success")

    expect(isErr(result)).toBe(false)
    expect(result).toBe("async success")
  })

  it("handles failed async operations", async () => {
    // oxlint-disable-next-line typescript/require-await - `attempt` must handle async functions that throw.
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
      // oxlint-disable-next-line no-throw-literal typescript/only-throw-error unicorn/no-null - `attempt` must handle a thrown `null`.
      throw null
    })
    expectErr(nullResult)
    expect(nullResult.messageChain).toBe("null")

    const undefinedResult = attempt(() => {
      // oxlint-disable-next-line no-throw-literal typescript/only-throw-error - `attempt` must handle a thrown `undefined`.
      throw undefined
    })
    expectErr(undefinedResult)
    expect(undefinedResult.messageChain).toBe("undefined")
  })
})
