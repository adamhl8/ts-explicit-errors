// oxlint-disable typescript/require-await
import { describe, expect, it, vi } from "vitest"

import { db, exampleMainWrapper } from "#/__tests__/example.ts"
import { expectErr } from "#/__tests__/helpers.ts"
import { attempt } from "#/attempt.ts"

describe("integration", () => {
  it("attempt and err work together", async () => {
    const result = await attempt(async () => {
      throw new Error("Original error")
    })

    expectErr(result)

    expect(result.messageChain).toBe("Original error")
  })

  it("handles nested error chains", async () => {
    const deepError = new Error("Deep error")
    const middleError = new Error("Middle error", { cause: deepError })

    const result = await attempt(async () => {
      throw middleError
    })

    expectErr(result)

    expect(result.messageChain).toBe("Middle error -> Deep error")
  })

  it("complete example", async () => {
    const connectSpy = vi.spyOn(db, "connect").mockImplementation(() => {
      throw new Error("invalid dbId")
    })

    const connectErrorFakeLoggerOutput = await exampleMainWrapper()

    expect(connectErrorFakeLoggerOutput).toBe(
      "<timestamp1> [main|connect] something went wrong -> failed to get meetings -> failed to connect to database -> invalid dbId",
    )

    connectSpy.mockRestore()

    const querySpy = vi.spyOn(db, "query").mockImplementation(() => {
      throw new Error("invalid query")
    })

    const queryErrorFakeLoggerOutput = await exampleMainWrapper()

    expect(queryErrorFakeLoggerOutput).toBe(
      "<timestamp2> [main|query] something went wrong -> failed to get meetings -> failed to query db -> invalid query: for 'SELECT * FROM meetings WHERE scheduled_time < actual_end_time'",
    )

    querySpy.mockRestore()
  })
})
