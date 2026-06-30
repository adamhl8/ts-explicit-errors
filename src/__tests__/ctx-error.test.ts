// oxlint-disable unicorn/no-null unicorn/no-useless-undefined unicorn/error-message vitest/no-conditional-in-test
import { describe, expect, it } from "vitest"

import { expectErr, throwsError } from "#/__tests__/helpers.ts"
import { attempt } from "#/attempt.ts"
import { CtxError, err, errWithCtx } from "#/ctx-error.ts"

class CustomError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = "CustomError"
  }
}

describe("CtxError (constructor)", () => {
  it("correctly extends Error and assigns properties", () => {
    const cause = new Error("Cause message")
    const error = new CtxError("Base message", { cause })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("CtxError")
    expect(error.message).toBe("Base message")
    expect(error.cause).toBe(cause)
  })

  it("correctly converts an Error", () => {
    const cause = new Error("Cause message")
    const errorToConvert = new Error("Base message", { cause })
    const error = new CtxError("should be overridden", {}, errorToConvert)
    error.stack = "<stack>"

    expect(error.name).toBe("Error")
    expect(error.message).toBe("Base message")
    expect(error.cause).toBe(cause)
    expect(error.stack).toBe("<stack>")
  })

  it("keeps its own stack when the converted Error has none", () => {
    const errorToConvert = new Error("Base message")
    errorToConvert.stack = ""
    const error = new CtxError("should be overridden", {}, errorToConvert)

    expect(error.message).toBe("Base message")
    expect(error.stack).not.toBe("")
  })
})

describe("err", () => {
  describe("messageChain", () => {
    it("equals message for a single error", () => {
      const error = err("Base message", undefined)

      expect(error.messageChain).toBe("Base message")
      expect(error.messageChain).toBe(error.message)
    })

    it("handles an error with a cause", () => {
      const cause = new Error("Cause message")
      const error = err("Base message", cause)

      expect(error.messageChain).toBe("Base message -> Cause message")
    })

    it("handles an error with nested causes", () => {
      const deepCause = new Error("Deep cause")
      const middleCause = new Error("Middle cause", { cause: deepCause })
      const error = err("Base message", middleCause)

      expect(error.messageChain).toBe("Base message -> Middle cause -> Deep cause")
    })

    it("includes custom error names in message and excludes Error and CtxError prefixes", () => {
      const regularError = new Error("Error message")
      const ctxError = err("CtxError message", undefined)
      const customError = new CustomError("CustomError message")

      const error1 = err("Base message", regularError)
      const error2 = err("Base message", ctxError)
      const error3 = err("Base message", customError)

      expect(error1.messageChain).toBe("Base message -> Error message")
      expect(error2.messageChain).toBe("Base message -> CtxError message")
      expect(error3.messageChain).toBe("Base message -> CustomError: CustomError message")
    })

    it("excludes blank error messages", () => {
      const blankError = new Error("")
      const error = err("Base message", blankError)

      expect(error.messageChain).toBe("Base message")
    })

    it("shows 'Unknown error' when all messages are blank", () => {
      const blankError = new Error("")
      const error = err("", blankError)

      expect(error.messageChain).toBe("Unknown error")
    })
  })

  describe("rootStack", () => {
    it("equals the stack of the last error in the chain", () => {
      const deepCause = new Error("Deep cause")
      deepCause.stack = "Deep stack"
      const middleCause = new Error("Middle cause", { cause: deepCause })
      const error = err("Base message", middleCause)

      expect(error.rootStack).toBe("Deep stack")
      expect(error.rootStack).toBe(deepCause.stack)

      const error2 = err("Base message", undefined)
      error2.stack = "Base stack"

      expect(error2.rootStack).toBe("Base stack")
      expect(error2.rootStack).toBe(error2.stack)
    })

    it("handles a blank/undefined stack", () => {
      const deepCause = new Error("Deep cause")
      deepCause.stack = ""
      const middleCause = new Error("Middle cause", { cause: deepCause })
      middleCause.stack = "Middle stack"
      const error = err("Base message", middleCause)

      expect(error.rootStack).toBe("Middle stack")
      expect(error.rootStack).toBe(middleCause.stack)
    })

    it("shows '<no stack>' when all stacks are blank", () => {
      const error = err("Base message", undefined)
      error.stack = ""

      expect(error.rootStack).toBe("<no stack>")
    })

    it("cleans the root stack", () => {
      const error = err("Base message", undefined)

      expect(error.rootStack).not.toContain("at new CtxError")
      expect(error.rootStack).not.toContain("at err")

      const attemptError = attempt(() => {
        throwsError()
      })
      expectErr(attemptError)

      const attemptErrorStackLength = attemptError.stack?.split("\n").length ?? 0
      const attemptErrorRootStackLength = attemptError.rootStack.split("\n").length

      expect(attemptError.stack).toContain("at attempt")
      expect(attemptError.rootStack).not.toContain("at attempt")
      expect(attemptErrorRootStackLength).toBe(attemptErrorStackLength - 1)
    })
  })

  describe("ctx", () => {
    it("adds context to error", () => {
      const error = err("Base message", undefined).ctx({ foo: "bar" })

      expect(error.context).toStrictEqual({ foo: "bar" })
    })

    it("merges multiple contexts", () => {
      const error = err("Base message", undefined).ctx({ foo: "bar" }).ctx({ baz: "qux" })

      expect(error.context).toStrictEqual({ foo: "bar", baz: "qux" })
    })
  })

  describe("get", () => {
    it("retrieves context value", () => {
      const error = err("Base message", undefined).ctx({ foo: "bar" })

      expect(error.get<string>("foo")).toBe("bar")
    })

    it("returns undefined for non-existent key", () => {
      const error = err("Base message", undefined).ctx({ foo: "bar" })

      expect(error.get<string>("nonexistent")).toBeUndefined()
    })

    it("retrieves falsy values correctly", () => {
      const error = err("Base message", undefined).ctx({
        zero: 0,
        empty: "",
        falseValue: false,
        nullValue: null,
        undefinedValue: undefined,
      })

      expect(error.get<number>("zero")).toBe(0)
      expect(error.get<string>("empty")).toBe("")
      expect(error.get<boolean>("falseValue")).toBe(false)
      expect(error.get<null>("nullValue")).toBeNull()
      // oxlint-disable-next-line typescript/no-confusing-void-expression
      expect(error.get<undefined>("undefinedValue")).toBeUndefined()
    })

    it("retrieves values from error chain", () => {
      const deepError = err("Deep error", undefined).ctx({ deepKey: "foo" })
      const middleError = err("Middle error", deepError).ctx({ middleKey: "bar" })
      const topError = err("Top error", middleError).ctx({ topKey: "baz" })

      expect(topError.get<string>("deepKey")).toBe("foo")
      expect(topError.get<string>("middleKey")).toBe("bar")
      expect(topError.get<string>("topKey")).toBe("baz")
    })

    it("retrieves deepest context value", () => {
      const deepError = err("Deep error", undefined).ctx({ deepKey: "foo", shared: "deep" })
      const middleError = err("Middle error", deepError).ctx({ middleKey: "bar", shared: "middle" })
      const topError = err("Top error", middleError).ctx({ topKey: "baz", shared: "top" })

      expect(topError.get<string>("shared")).toBe("deep")
    })
  })

  describe("getAll", () => {
    it("retrieves single context value as array", () => {
      const error = err("Base message", undefined).ctx({ foo: "bar" })

      expect(error.getAll("foo")).toStrictEqual(["bar"])
    })

    it("returns empty array for non-existent key", () => {
      const error = err("Base message", undefined).ctx({ foo: "bar" })

      expect(error.getAll("nonexistent")).toStrictEqual([])
    })

    it("retrieves falsy values correctly", () => {
      const error = err("Base message", undefined).ctx({
        zero: 0,
        empty: "",
        falseValue: false,
        nullValue: null,
        undefinedValue: undefined,
      })

      expect(error.getAll("zero")).toStrictEqual([0])
      expect(error.getAll("empty")).toStrictEqual([""])
      expect(error.getAll("falseValue")).toStrictEqual([false])
      expect(error.getAll("nullValue")).toStrictEqual([null])
      expect(error.getAll("undefinedValue")).toStrictEqual([undefined])
    })

    it("retrieves values from error chain", () => {
      const deepError = err("Deep error", undefined).ctx({ deepKey: "foo" })
      const middleError = err("Middle error", deepError).ctx({ middleKey: "bar" })
      const topError = err("Top error", middleError).ctx({ topKey: "baz" })

      expect(topError.getAll("deepKey")).toStrictEqual(["foo"])
      expect(topError.getAll("middleKey")).toStrictEqual(["bar"])
      expect(topError.getAll("topKey")).toStrictEqual(["baz"])
    })

    it("retrieves all values for shared keys in shallowest to deepest order", () => {
      const deepError = err("Deep error", undefined).ctx({ shared: "deep" })
      const middleError = err("Middle error", deepError).ctx({ shared: "middle" })
      const topError = err("Top error", middleError).ctx({ shared: "top" })

      expect(topError.getAll<string>("shared")).toStrictEqual(["top", "middle", "deep"])
    })

    it("handles gaps in the error chain", () => {
      const deepError = err("Deep error", undefined).ctx({ shared: "deep" })
      const middleError = err("Middle error", deepError).ctx({ otherKey: "other" })
      const topError = err("Top error", middleError).ctx({ shared: "top" })

      expect(topError.getAll("shared")).toStrictEqual(["top", "deep"])
    })
  })
})

describe("errWithCtx", () => {
  it("creates an error with predefined context", () => {
    const scopedErr = errWithCtx({ scope: "foo" })
    const error = scopedErr("Base message", undefined)

    expectErr(error)

    expect(error.messageChain).toBe("Base message")
    expect(error.context).toStrictEqual({ scope: "foo" })
  })

  it("passes cause to the error", () => {
    const scopedErr = errWithCtx({ scope: "foo" })
    const cause = new Error("cause message")
    const error = scopedErr("Base message", cause)

    expectErr(error)

    expect(error.messageChain).toBe("Base message -> cause message")
    expect(error.cause).toBe(cause)
    expect(error.context).toStrictEqual({ scope: "foo" })
  })

  it("allows adding additional context", () => {
    const scopedErr = errWithCtx({ scope: "foo" })
    const error = scopedErr("Base message", undefined).ctx({ bar: 123 })

    expectErr(error)

    expect(error.messageChain).toBe("Base message")
    expect(error.context).toStrictEqual({ scope: "foo", bar: 123 })
  })

  it("works with error chaining", () => {
    const fooErr = errWithCtx({ scope: "foo" })
    const barErr = errWithCtx({ scope: "bar" })

    const fooError = fooErr("foo error", undefined)
    const barError = barErr("bar error", fooError)

    expectErr(barError)

    expect(barError.messageChain).toBe("bar error -> foo error")
    expect(barError.getAll("scope")).toStrictEqual(["bar", "foo"])
  })
})
