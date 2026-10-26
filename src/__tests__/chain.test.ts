import { describe, expect, it } from "bun:test"
import { runInNewContext } from "node:vm"

import { $ } from "bun"

import { expectErr, throwing, throwsError } from "#__tests__/helpers.ts"
import { attempt } from "#attempt.ts"
import { findCause, getAllContext, getContext, messageChain, rootStack } from "#chain.ts"
import { err, errWithCtx } from "#err.ts"
import { isErr } from "#result.ts"

const vmError = (source: string): Error => {
  const value: unknown = runInNewContext(source)
  if (!isErr(value)) throw new TypeError("expected the source to create an Error")
  return value
}

const attemptLogin = (): void => {
  throw new Error("bad password")
}

// Store the result before returning it because JavaScriptCore drops the caller's frame for a tail call.
const errorHandler = () => {
  const result = attempt(attemptLogin)
  return result
}

class CustomError extends Error {
  public override name = "CustomError"
}
class ChainError extends Error {
  public override name = "ChainError"
}
abstract class AppError extends Error {
  public override name = "AppError"
}
class NotFoundError extends AppError {
  public override name = "NotFoundError"
}

describe("messageChain", () => {
  it("includes a foreign error's name", async () => {
    // oxlint-disable-next-line typescript/promise-function-async - Covers the common `attempt(() => promise)` call shape.
    const shellErr = await attempt(() => $`exit 3`.quiet())
    expectErr(shellErr)

    expect(messageChain(err("failed to deploy", shellErr))).toBe(
      "failed to deploy -> ShellError: Failed with exit code 3",
    )
  })

  it("equals message for a single error", () => {
    const error = err("Base message", undefined)

    expect(messageChain(error)).toBe("Base message")
    expect(messageChain(error)).toBe(error.message)
  })

  it("handles an error with a cause", () => {
    const error = err("Base message", new Error("Cause message"))

    expect(messageChain(error)).toBe("Base message -> Cause message")
  })

  it("handles an error with nested causes", () => {
    const deepCause = new Error("Deep cause")
    const middleCause = new Error("Middle cause", { cause: deepCause })

    expect(messageChain(err("Base message", middleCause))).toBe("Base message -> Middle cause -> Deep cause")
  })

  it("prefixes names other than Error, including the first link", () => {
    expect(messageChain(new CustomError("c"))).toBe("CustomError: c")
    const withCustomCause = err("Base", new CustomError("c"))
    const withPlainCause = err("Base", new Error("e"))

    expect(messageChain(withCustomCause)).toBe("Base -> CustomError: c")
    expect(messageChain(withPlainCause)).toBe("Base -> e")
  })

  it("excludes blank error messages", () => {
    // oxlint-disable-next-line unicorn/error-message - The test covers blank messages.
    const error = err("Base message", new Error(""))

    expect(messageChain(error)).toBe("Base message")
  })

  it("shows 'Unknown error' when all messages are blank", () => {
    // oxlint-disable-next-line unicorn/error-message - The test covers blank messages.
    const error = err("", new Error(""))

    expect(messageChain(error)).toBe("Unknown error")
  })

  it("treats a non-string message as empty", () => {
    const cause = new Error("hidden")
    Object.defineProperty(cause, "message", { value: undefined })

    expect(messageChain(err("top", cause))).toBe("top")
  })

  it("skips the prefix for a symbol or blank name", () => {
    const symbolName = new Error("m")
    Object.defineProperty(symbolName, "name", { value: Symbol("s") })
    const blankName = new Error("m")
    blankName.name = ""

    expect(messageChain(err("top", symbolName))).toBe("top -> m")
    expect(messageChain(err("top", blankName))).toBe("top -> m")
  })

  it("walks through a cross-realm cause", () => {
    const top = err("top", err("mid", vmError("new Error('vm')"), { k: 1 }))

    expect(messageChain(top)).toBe("top -> mid -> vm")
    expect(getContext(top, "k")).toBe(1)
  })
})

describe("rootStack", () => {
  it("equals the stack of the last error in the chain", () => {
    const deepCause = new Error("Deep cause")
    deepCause.stack = "Deep stack"
    const middleCause = new Error("Middle cause", { cause: deepCause })

    expect(rootStack(err("Base message", middleCause))).toBe("Deep stack")

    const error = err("Base message", undefined)
    error.stack = "Base stack"

    expect(rootStack(error)).toBe("Base stack")
  })

  it("handles a blank stack", () => {
    const deepCause = new Error("Deep cause")
    deepCause.stack = ""
    const middleCause = new Error("Middle cause", { cause: deepCause })
    middleCause.stack = "Middle stack"

    expect(rootStack(err("Base message", middleCause))).toBe("Middle stack")
  })

  it.each([undefined, 42])("skips a %p stack", (stack) => {
    const deepCause = new Error("Deep cause")
    Object.defineProperty(deepCause, "stack", { value: stack })
    const middleCause = new Error("Middle cause", { cause: deepCause })
    middleCause.stack = "Middle stack"

    expect(rootStack(err("Base message", middleCause))).toBe("Middle stack")
  })

  it("shows '<no stack>' when all stacks are blank", () => {
    const error = err("Base message", undefined)
    error.stack = ""

    expect(rootStack(error)).toBe("<no stack>")
  })

  it("cleans the root stack", () => {
    expect(rootStack(err("Base message", undefined))).not.toContain("at err")

    const attemptError = attempt(() => {
      throwsError()
    })
    expectErr(attemptError)
    const wrapped = err("wrapped", attemptError)

    const attemptErrorStackLength = String(attemptError.stack).split("\n").length
    const wrappedRootStackLength = rootStack(wrapped).split("\n").length

    expect(attemptError.stack).toContain("at attempt")
    expect(rootStack(wrapped)).not.toContain("at attempt")
    expect(wrappedRootStackLength).toBe(attemptErrorStackLength - 1)
  })
})

describe("rootStack frames", () => {
  it("keeps user frames whose names start with err or attempt", () => {
    const failure = errorHandler()
    expectErr(failure)
    const stack = rootStack(err("login failed", failure))

    expect(stack).toContain("at attemptLogin")
    expect(stack).toContain("at errorHandler")
  })
})

describe("getContext", () => {
  it("retrieves a context value", () => {
    expect(getContext<string>(err("Base message", undefined, { foo: "bar" }), "foo")).toBe("bar")
  })

  it("returns undefined for a missing key", () => {
    expect(getContext(err("Base message", undefined, { foo: "bar" }), "nonexistent")).toBeUndefined()
  })

  it("retrieves falsy values", () => {
    const error = err("Base message", undefined, {
      zero: 0,
      empty: "",
      falseValue: false,
      // oxlint-disable-next-line unicorn/no-null - The test covers falsy context values.
      nullValue: null,
      undefinedValue: undefined,
    })

    expect(getContext<number>(error, "zero")).toBe(0)
    expect(getContext<string>(error, "empty")).toBe("")
    expect(getContext<boolean>(error, "falseValue")).toBe(false)
    expect(getContext<null>(error, "nullValue")).toBeNull()
    expect(getContext(error, "undefinedValue")).toBeUndefined()
  })

  it("retrieves values from the error chain", () => {
    const deepError = err("Deep error", undefined, { deepKey: "foo" })
    const middleError = err("Middle error", deepError, { middleKey: "bar" })
    const topError = err("Top error", middleError, { topKey: "baz" })

    expect(getContext(topError, "deepKey")).toBe("foo")
    expect(getContext(topError, "middleKey")).toBe("bar")
    expect(getContext(topError, "topKey")).toBe("baz")
  })

  it("retrieves the deepest value", () => {
    const deepError = err("Deep error", undefined, { shared: "deep" })
    const middleError = err("Middle error", deepError, { shared: "middle" })
    const topError = err("Top error", middleError, { shared: "top" })

    expect(getContext(topError, "shared")).toBe("deep")
  })

  it("ignores prototype keys", () => {
    expect(getContext(err("x", undefined, {}), "toString")).toBeUndefined()
  })
})

describe("getAllContext", () => {
  it("retrieves a single value as an array", () => {
    expect(getAllContext(err("Base message", undefined, { foo: "bar" }), "foo")).toStrictEqual(["bar"])
  })

  it("returns an empty array for a missing key", () => {
    expect(getAllContext(err("Base message", undefined, { foo: "bar" }), "nonexistent")).toStrictEqual([])
  })

  it("retrieves falsy values", () => {
    const error = err("Base message", undefined, {
      zero: 0,
      empty: "",
      falseValue: false,
      // oxlint-disable-next-line unicorn/no-null - The test covers falsy context values.
      nullValue: null,
      undefinedValue: undefined,
    })

    expect(getAllContext(error, "zero")).toStrictEqual([0])
    expect(getAllContext(error, "empty")).toStrictEqual([""])
    expect(getAllContext(error, "falseValue")).toStrictEqual([false])
    // oxlint-disable-next-line unicorn/no-null - The test covers falsy context values.
    expect(getAllContext(error, "nullValue")).toStrictEqual([null])
    expect(getAllContext(error, "undefinedValue")).toStrictEqual([undefined])
  })

  it("retrieves values for shared keys in shallowest to deepest order", () => {
    const deepError = err("Deep error", undefined, { shared: "deep" })
    const middleError = err("Middle error", deepError, { shared: "middle" })
    const topError = err("Top error", middleError, { shared: "top" })

    expect(getAllContext<string>(topError, "shared")).toStrictEqual(["top", "middle", "deep"])
  })

  it("handles gaps in the error chain", () => {
    const deepError = err("Deep error", undefined, { shared: "deep" })
    const middleError = err("Middle error", deepError, { otherKey: "other" })
    const topError = err("Top error", middleError, { shared: "top" })

    expect(getAllContext(topError, "shared")).toStrictEqual(["top", "deep"])
  })

  it("works with errWithCtx chaining", () => {
    const fooError = errWithCtx({ scope: "foo" })("foo error", undefined)
    const barError = errWithCtx({ scope: "bar" })("bar error", fooError)

    expect(messageChain(barError)).toBe("bar error -> foo error")
    expect(getAllContext(barError, "scope")).toStrictEqual(["bar", "foo"])
  })
})

describe("context through foreign links", () => {
  it("finds context below a foreign link", () => {
    const inner = err("inner", undefined, { k: 1 })
    const result = attempt(throwing(new Error("x", { cause: inner })))
    expectErr(result)
    const top = err("top", result, { k: 2 })

    expect(getContext(top, "k")).toBe(1)
    expect(getAllContext(top, "k")).toStrictEqual([2, 1])
  })

  it("finds context above a foreign root", () => {
    const top = err("top", new Error("root"), { k: 1 })

    expect(getContext(top, "k")).toBe(1)
  })

  it("stops at a non-Error cause", () => {
    const top = err("top", new Error("x", { cause: "str" }), { k: 1 })

    expect(getContext(top, "k")).toBe(1)
    expect(getAllContext(top, "k")).toStrictEqual([1])
    expect(messageChain(top)).toBe("top -> x")
  })

  it("stops at a revoked proxy cause", () => {
    const { proxy, revoke } = Proxy.revocable({}, {})
    revoke()
    const top = err("top", new Error("x", { cause: proxy }), { k: 1 })

    expect(messageChain(top)).toBe("top -> x")
    expect(getContext(top, "k")).toBe(1)
  })

  it("reads context through a frozen foreign link", () => {
    const inner = err("inner", undefined, { k: 1 })
    const top = err("top", Object.freeze(new Error("x", { cause: inner })), { k: 2 })

    expect(getContext(top, "k")).toBe(1)
    expect(getAllContext(top, "k")).toStrictEqual([2, 1])
  })

  it("ignores a foreign error's own context field", () => {
    const httpError = Object.assign(new Error("502"), { context: { retry: true } })
    const top = err("failed to sync", httpError, { jobId: 42 })

    expect(getContext(top, "retry")).toBeUndefined()
    expect(getContext(top, "jobId")).toBe(42)
  })

  it("skips a marked error whose context is not an object", () => {
    // oxlint-disable-next-line unicorn/no-null - The test covers a context someone reassigned to `null`.
    const error = Object.assign(err("x", undefined, { k: 1 }), { context: null })

    expect(getContext(error, "k")).toBeUndefined()
    expect(getAllContext(error, "k")).toStrictEqual([])
  })

  it("reads context from an error marked by another copy", () => {
    const other = new Error("other")
    Object.defineProperty(other, Symbol.for("ts-explicit-errors.err"), { value: true })
    Object.assign(other, { context: { k: "from other copy" } })

    expect(getContext(err("top", other), "k")).toBe("from other copy")
  })
})

describe("findCause", () => {
  it("finds a ShellError two levels down", async () => {
    // oxlint-disable-next-line typescript/promise-function-async - Covers the common `attempt(() => promise)` call shape.
    const shell = await attempt(() => $`exit 3`.quiet())
    expectErr(shell)
    const top = err("top", err("mid", shell))

    const found = findCause(top, $.ShellError)
    const foundError: unknown = found

    expect(foundError).toBe(shell)
    expect(found?.exitCode).toBe(3)
  })

  it("returns undefined when nothing matches", () => {
    const top = err("top", new Error("x"))

    expect(findCause(top, TypeError)).toBeUndefined()
  })

  it("returns the shallowest match", () => {
    const deep = new ChainError("deep")
    const shallow = new ChainError("shallow", { cause: deep })

    expect(findCause(err("top", shallow), ChainError)).toBe(shallow)
  })

  it("can match the error itself", () => {
    const top = err("top", undefined)

    expect(findCause(top, Error)).toBe(top)
  })

  it("matches an abstract base class", () => {
    const notFound = new NotFoundError("nf")

    const found: AppError | undefined = findCause(err("top", notFound), AppError)

    expect(found).toBe(notFound)
  })

  it("stops at a non-Error cause", () => {
    const top = err("top", new Error("x", { cause: "str" }))

    expect(findCause(top, TypeError)).toBeUndefined()
  })

  it("finds a DOMException partway down the chain", () => {
    const abortError = new DOMException("x", "AbortError")
    const top = err("top", new Error("mid", { cause: abortError }))

    expect(findCause(top, DOMException)).toBe(abortError)
    expect(messageChain(top)).toBe("top -> mid -> AbortError: x")
  })

  it("finds a frozen foreign error", () => {
    const frozen = Object.freeze(new TypeError("t"))

    expect(findCause(err("top", frozen), TypeError)).toBe(frozen)
  })

  it("rejects a class that isn't an Error", () => {
    // @ts-expect-error - `findCause` only accepts `Error` classes.
    expect(findCause(err("top", undefined), Date)).toBeUndefined()
  })
})
