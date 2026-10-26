import { describe, expect, it } from "bun:test"
import { runInNewContext } from "node:vm"

import { $ } from "bun"

import { expectErr, throwing } from "#__tests__/helpers.ts"
import { attempt } from "#attempt.ts"
import { messageChain } from "#chain.ts"
import { err } from "#err.ts"
import { isErr } from "#result.ts"

const asShellError = (value: unknown) => (value instanceof $.ShellError ? value : undefined)

const unprintable = (): unknown[] => [
  Object.create(null),
  {
    toString: () => {
      throw new Error("no")
    },
  },
]

describe("attempt", () => {
  it("handles successful synchronous operations", () => {
    const result = attempt(() => "success")

    expect(isErr(result)).toBe(false)
    expect(result).toBe("success")
  })

  it("handles successful async operations", async () => {
    // oxlint-disable-next-line typescript/require-await - `attempt` must handle async functions.
    const result = await attempt(async () => "async success")

    expect(isErr(result)).toBe(false)
    expect(result).toBe("async success")
  })

  it("returns the thrown Error itself", () => {
    const thrown = new Error("sync error")

    expect(attempt(throwing(thrown))).toBe(thrown)
  })

  it("returns the rejected Error itself from an async function", async () => {
    const thrown = new Error("async error")

    // oxlint-disable-next-line typescript/require-await - `attempt` must handle async functions that throw.
    const result = await attempt(async () => {
      throw thrown
    })

    expect(result).toBe(thrown)
  })

  it("returns the error from a promise-returning function that throws before returning", async () => {
    const thrown = new Error("early")

    // oxlint-disable-next-line typescript/promise-function-async - The function must throw synchronously, which an `async` function can't do.
    const result = attempt((): Promise<number> => {
      throw thrown
    })

    expect(await result).toBe(thrown)
  })

  it("keeps a ShellError intact", async () => {
    // oxlint-disable-next-line typescript/promise-function-async - Covers the common `attempt(() => promise)` call shape.
    const result = await attempt(() => $`echo hi; exit 3`.quiet())

    expect(result).toBeInstanceOf($.ShellError)
    expect(asShellError(result)?.exitCode).toBe(3)
    expect(asShellError(result)?.text()).toBe("hi\n")
  })

  it.each([
    ["string error", "string error"],
    // oxlint-disable-next-line unicorn/no-null - `attempt` must handle a thrown `null`.
    [null, "null"],
    [undefined, "undefined"],
    [{ code: 1 }, "[object Object]"],
  ])("converts a thrown %p into an Error with the raw value as cause", (value, message) => {
    const result = attempt(throwing(value))

    expectErr(result)
    expect(result.message).toBe(message)
    expect(result.cause).toBe(value)
  })

  it("converts a non-Error async rejection", async () => {
    // oxlint-disable-next-line typescript/promise-function-async prefer-promise-reject-errors - Covers a plain function that returns a promise rejected with a non-Error.
    const result = await attempt(() => Promise.reject("nope"))

    expectErr(result)
    expect(result.message).toBe("nope")
    expect(result.cause).toBe("nope")
  })

  it.each(unprintable())("converts %#, a value whose String conversion throws", async (value) => {
    const result = attempt(throwing(value))
    expectErr(result)
    expect(result.message).toBe("[object Object]")
    expect(result.cause).toBe(value)

    // oxlint-disable-next-line typescript/require-await - `attempt` must handle async functions that throw.
    const asyncResult = await attempt(async () => {
      throwing(value)()
    })
    expectErr(asyncResult)
    expect(asyncResult.message).toBe("[object Object]")
  })

  it("converts a value that no conversion can describe", async () => {
    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()

    const result = attempt(throwing(proxy))
    expectErr(result)
    expect(result.message).toBe("Unknown error")
    expect(result.cause).toBe(proxy)

    // oxlint-disable-next-line typescript/require-await - `attempt` must handle async functions that throw.
    const asyncResult = await attempt(async () => {
      throwing(proxy)()
    })
    expectErr(asyncResult)
    expect(asyncResult.message).toBe("Unknown error")
  })

  it("returns an error from another realm unchanged", () => {
    const vmError: unknown = runInNewContext("new Error('vm')")

    const result: unknown = attempt(throwing(vmError))

    expect(result).toBe(vmError)
    expect(isErr(result)).toBe(true)
  })

  it("returns a DOMException unchanged", () => {
    const result = attempt(() => {
      AbortSignal.abort().throwIfAborted()
    })

    expect(result).toBeInstanceOf(DOMException)
    expectErr(result)
    expect(result.name).toBe("AbortError")
  })

  it("does not modify the thrown error", () => {
    const frozen = Object.freeze(new Error("frozen"))
    const keys = Reflect.ownKeys(frozen)

    const result = attempt(throwing(frozen))

    expect(result).toBe(frozen)
    expect(Reflect.ownKeys(frozen)).toStrictEqual(keys)
    expectErr(result)
    expect(messageChain(err("wrapped", result))).toBe("wrapped -> frozen")
  })
})
