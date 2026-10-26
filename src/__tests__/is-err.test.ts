import { describe, expect, it } from "bun:test"
import { runInNewContext } from "node:vm"

import { $ } from "bun"

import { throwing } from "#__tests__/helpers.ts"
import { attempt } from "#attempt.ts"
import { messageChain } from "#chain.ts"
import { err } from "#err.ts"
import { isErr } from "#result.ts"
import type { Result } from "#result.ts"

// Each helper branches on `isErr` and assigns the narrowed value to an annotated `const`, so it only compiles when the narrowing is right.

const labelStringResult = (result: Result<string>) => {
  if (isErr(result)) {
    const error: Error = result
    return `err: ${error.message}`
  }
  const value: string = result
  return `ok: ${value}`
}

const labelArrayResult = (result: Result<string[]>) => {
  if (isErr(result)) {
    const error: Error = result
    return `err: ${error.message}`
  }
  const value: string[] = result
  return `ok: ${value.join(",")}`
}

const labelNameResult = (result: Result<{ name: string }>) => {
  if (isErr(result)) {
    const error: Error = result
    return `err: ${error.message}`
  }
  const value: { name: string } = result
  return `ok: ${value.name}`
}

// oxlint-disable-next-line typescript/no-explicit-any - `Result<any>` collapses to `any`, which is the case under test.
const labelAnyResult = (result: Result<any>) => {
  if (isErr(result)) {
    const error: Error = result
    return `err: ${error.message}`
  }
  return "ok"
}

const labelUnknownResult = (result: Result<unknown>) => {
  if (isErr(result)) {
    const error: Error = result
    return `err: ${error.message}`
  }
  return "ok"
}

const labelGenericResult = <T>(result: Result<T>): T | string => {
  if (isErr(result)) {
    const error: Error = result
    return `err: ${error.message}`
  }
  const value: T = result
  return value
}

const labelAwaitedGenericResult = async <T>(pending: Promise<Result<T>>): Promise<T | string> => {
  const result = await pending
  if (isErr(result)) {
    const error: Error = result
    return `err: ${error.message}`
  }
  const value: T = result
  return value
}

const labelNumberOrError = (result: number | Error) => {
  if (isErr(result)) {
    const error: Error = result
    return `err: ${error.message}`
  }
  const value: number = result
  return `ok: ${value}`
}

const wrapSync = <T>(fn: () => T): Result<T> => {
  const result = attempt(fn)
  if (isErr(result)) return err("wrapped", result)
  return result
}

const wrapAsync = async <T>(fn: () => Promise<T>): Promise<Result<T>> => {
  const result = await attempt(fn)
  if (isErr(result)) return err("wrapped", result)
  return result
}

const messageOf = (result: Result<unknown>) => (isErr(result) ? messageChain(result) : "ok")

describe("isErr", () => {
  it("narrows Result<string>", () => {
    expect(labelStringResult(new Error("x"))).toBe("err: x")
    expect(labelStringResult("a")).toBe("ok: a")
  })

  it("narrows Result<string[]>", () => {
    expect(labelArrayResult(new Error("x"))).toBe("err: x")
    expect(labelArrayResult(["a", "b"])).toBe("ok: a,b")
  })

  it("narrows Result<{ name: string }>", () => {
    expect(labelNameResult(new Error("x"))).toBe("err: x")
    expect(labelNameResult({ name: "a" })).toBe("ok: a")
  })

  it("narrows Result<any>", () => {
    expect(labelAnyResult(new Error("x"))).toBe("err: x")
    expect(labelAnyResult(1)).toBe("ok")
  })

  it("narrows Result<unknown>", () => {
    expect(labelUnknownResult(new Error("x"))).toBe("err: x")
    expect(labelUnknownResult(1)).toBe("ok")
  })

  it("narrows a generic Result<T>", () => {
    expect(labelGenericResult(new Error("x"))).toBe("err: x")
    expect(labelGenericResult(1)).toBe(1)
  })

  it("narrows an awaited generic Result<T>", async () => {
    const failed = Promise.resolve(new Error("x"))

    expect(await labelAwaitedGenericResult(failed)).toBe("err: x")
    expect(await labelAwaitedGenericResult(Promise.resolve(1))).toBe(1)
  })

  it("narrows number | Error", () => {
    expect(labelNumberOrError(new Error("x"))).toBe("err: x")
    expect(labelNumberOrError(1)).toBe("ok: 1")
  })

  it("compiles a generic wrapper around attempt", async () => {
    const boom = new Error("boom")
    const syncFailure = wrapSync(throwing(boom))
    // oxlint-disable-next-line typescript/require-await - The wrapper must handle async functions that throw.
    const asyncFailure = await wrapAsync(async () => {
      throwing(boom)()
    })

    expect(messageOf(syncFailure)).toBe("wrapped -> boom")
    expect(messageOf(asyncFailure)).toBe("wrapped -> boom")
    expect(wrapSync(() => 1)).toBe(1)
    // oxlint-disable-next-line typescript/require-await - The wrapper must handle async functions.
    expect(await wrapAsync(async () => 1)).toBe(1)
  })

  it("filters and finds errors in a Result array", () => {
    const boom = new Error("boom")
    const results: Result<number>[] = [1, boom, 2]

    const errors: Error[] = results.filter(isErr)
    const firstError: Error | undefined = results.find(isErr)

    expect(errors).toStrictEqual([boom])
    expect(firstError).toBe(boom)
  })

  it("recognizes plain, DOMException, and cross-realm errors", () => {
    const vmError: unknown = runInNewContext("new Error('vm')")

    expect(isErr(new Error("x"))).toBe(true)
    expect(isErr(new DOMException("x", "AbortError"))).toBe(true)
    expect(isErr(vmError)).toBe(true)
  })

  it("works on a runtime without Error.isError", async () => {
    // Run in a subprocess so deleting `Error.isError` doesn't leak into this test process.
    // Print strings because `console.log` colors booleans when `FORCE_COLOR` is set.
    const script = `delete Error.isError; const { isErr } = await import("${import.meta.resolve("#result.ts")}"); console.log(String(isErr(new Error("x"))), String(isErr(1)))`
    const output = await $`bun -e ${script}`.quiet().text()

    expect(output.trim()).toBe("true false")
  })

  it("rejects non-errors", () => {
    // oxlint-disable-next-line unicorn/no-null - `isErr` must reject `null`.
    for (const value of [1, "x", null, undefined, { message: "x" }]) expect(isErr(value)).toBe(false)
  })
})
