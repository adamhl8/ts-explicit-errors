/** biome-ignore-all lint/style/useThrowOnlyError: for tests */
/** biome-ignore-all lint/suspicious/useErrorMessage: for tests */
/** biome-ignore-all lint/suspicious/useAwait: for tests */
import { describe, expect, spyOn, test } from "bun:test"

import { db, exampleMainWrapper } from "@/__tests__/example.js"
import type { Result } from "@/index.js"
import { attempt, CtxError, err, errWithCtx, isErr } from "@/index.js"

class CustomError extends Error {
  public constructor(message: string) {
    super(message)
    this.name = "CustomError"
  }
}

const throwsError = () => {
  throw new Error("sync error")
}

const throwsString = () => {
  throw "string error"
}

function expectErr<T>(result: Result<T>): asserts result is CtxError {
  // biome-ignore lint/suspicious/noMisplacedAssertion: wrapper function
  expect(isErr(result)).toBe(true)
}

describe("attempt", () => {
  test("handles successful synchronous operations", () => {
    const result = attempt(() => "success")

    expect(isErr(result)).toBe(false)
    expect(result).toBe("success")
  })

  test("handles failed synchronous operations", () => {
    const result = attempt(() => {
      throwsError()
    })

    expectErr(result)

    expect(result.messageChain).toBe("sync error")
  })

  test("handles successful async operations", async () => {
    const result = await attempt(async () => "async success")

    expect(isErr(result)).toBe(false)
    expect(result).toBe("async success")
  })

  test("handles failed async operations", async () => {
    const result = await attempt(async () => {
      throw new Error("async error")
    })

    expectErr(result)

    expect(result.messageChain).toBe("async error")
  })

  test("handles non-Error throws", () => {
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

describe("CtxError (constructor)", () => {
  test("correctly extends Error and assigns properties", () => {
    const cause = new Error("Cause message")
    const error = new CtxError("Base message", { cause })

    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe("CtxError")
    expect(error.message).toBe("Base message")
    expect(error.cause).toBe(cause)
  })

  test("correctly converts an Error", () => {
    const cause = new Error("Cause message")
    const errorToConvert = new Error("Base message", { cause })
    const error = new CtxError("should be overridden", {}, errorToConvert)
    error.stack = "<stack>"

    expect(error.name).toBe("Error")
    expect(error.message).toBe("Base message")
    expect(error.cause).toBe(cause)
    expect(error.stack).toBe("<stack>")
  })
})

describe("err", () => {
  describe("messageChain", () => {
    test("equals message for a single error", () => {
      const error = err("Base message")

      expect(error.messageChain).toBe("Base message")
      expect(error.messageChain).toBe(error.message)
    })

    test("handles an error with a cause", () => {
      const cause = new Error("Cause message")
      const error = err("Base message", cause)

      expect(error.messageChain).toBe("Base message -> Cause message")
    })

    test("handles an error with nested causes", () => {
      const deepCause = new Error("Deep cause")
      const middleCause = new Error("Middle cause", { cause: deepCause })
      const error = err("Base message", middleCause)

      expect(error.messageChain).toBe("Base message -> Middle cause -> Deep cause")
    })

    test("includes custom error names in message and excludes Error and CtxError prefixes", () => {
      const regularError = new Error("Error message")
      const ctxError = err("CtxError message")
      const customError = new CustomError("CustomError message")

      const error1 = err("Base message", regularError)
      const error2 = err("Base message", ctxError)
      const error3 = err("Base message", customError)

      expect(error1.messageChain).toBe("Base message -> Error message")
      expect(error2.messageChain).toBe("Base message -> CtxError message")
      expect(error3.messageChain).toBe("Base message -> CustomError: CustomError message")
    })

    test("excludes blank error messages", () => {
      const blankError = new Error("")
      const error = err("Base message", blankError)

      expect(error.messageChain).toBe("Base message")
    })

    test("shows 'Unknown error' when all messages are blank", () => {
      const blankError = new Error("")
      const error = err("", blankError)

      expect(error.messageChain).toBe("Unknown error")
    })
  })

  describe("rootStack", () => {
    test("equals the stack of the last error in the chain", () => {
      const deepCause = new Error("Deep cause")
      deepCause.stack = "Deep stack"
      const middleCause = new Error("Middle cause", { cause: deepCause })
      const error = err("Base message", middleCause)

      expect(error.rootStack).toBe("Deep stack")
      expect(error.rootStack).toBe(deepCause.stack)

      const error2 = err("Base message")
      error2.stack = "Base stack"

      expect(error2.rootStack).toBe("Base stack")
      expect(error2.rootStack).toBe(error2.stack)
    })

    test("handles a blank/undefined stack", () => {
      const deepCause = new Error("Deep cause")
      deepCause.stack = ""
      const middleCause = new Error("Middle cause", { cause: deepCause })
      middleCause.stack = "Middle stack"
      const error = err("Base message", middleCause)

      expect(error.rootStack).toBe("Middle stack")
      expect(error.rootStack).toBe(middleCause.stack)
    })

    test("shows '<no stack>' when all stacks are blank", () => {
      const error = err("Base message")
      error.stack = ""

      expect(error.rootStack).toBe("<no stack>")
    })

    test("cleans the root stack", () => {
      const error = err("Base message")
      const stackLength = error.stack?.split("\n").length ?? 0
      const rootStackLength = error.rootStack.split("\n").length

      expect(error.stack).toContain("at err")
      expect(error.stack).toContain("at new CtxError")
      expect(error.rootStack).not.toContain("at new CtxError")
      expect(error.rootStack).not.toContain("at err")
      expect(rootStackLength).toBe(stackLength - 2)

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
    test("adds context to error", () => {
      const error = err("Base message").ctx({ foo: "bar" })

      expect(error.context).toEqual({ foo: "bar" })
    })

    test("merges multiple contexts", () => {
      const error = err("Base message").ctx({ foo: "bar" }).ctx({ baz: "qux" })

      expect(error.context).toEqual({ foo: "bar", baz: "qux" })
    })
  })

  describe("get", () => {
    test("retrieves context value", () => {
      const error = err("Base message").ctx({ foo: "bar" })

      expect(error.get<string>("foo")).toBe("bar")
    })

    test("returns undefined for non-existent key", () => {
      const error = err("Base message").ctx({ foo: "bar" })

      expect(error.get<string>("nonexistent")).toBeUndefined()
    })

    test("retrieves falsy values correctly", () => {
      const error = err("Base message").ctx({
        zero: 0,
        empty: "",
        falseValue: false,
        nullValue: null,
        undefinedValue: undefined,
      })

      expect(error.get<number>("zero")).toBe(0)
      expect(error.get<string>("empty")).toBe("")
      expect(error.get<boolean>("falseValue")).toBe(false)
      expect(error.get<null>("nullValue")).toBe(null)
      expect(error.get<undefined>("undefinedValue")).toBeUndefined()
    })

    test("retrieves values from error chain", () => {
      const deepError = err("Deep error").ctx({ deepKey: "foo" })
      const middleError = err("Middle error", deepError).ctx({ middleKey: "bar" })
      const topError = err("Top error", middleError).ctx({ topKey: "baz" })

      expect(topError.get<string>("deepKey")).toBe("foo")
      expect(topError.get<string>("middleKey")).toBe("bar")
      expect(topError.get<string>("topKey")).toBe("baz")
    })

    test("retrieves deepest context value", () => {
      const deepError = err("Deep error").ctx({ deepKey: "foo", shared: "deep" })
      const middleError = err("Middle error", deepError).ctx({ middleKey: "bar", shared: "middle" })
      const topError = err("Top error", middleError).ctx({ topKey: "baz", shared: "top" })

      expect(topError.get<string>("shared")).toBe("deep")
    })
  })

  describe("getAll", () => {
    test("retrieves single context value as array", () => {
      const error = err("Base message").ctx({ foo: "bar" })

      expect(error.getAll("foo")).toEqual(["bar"])
    })

    test("returns empty array for non-existent key", () => {
      const error = err("Base message").ctx({ foo: "bar" })

      expect(error.getAll("nonexistent")).toEqual([])
    })

    test("retrieves falsy values correctly", () => {
      const error = err("Base message").ctx({
        zero: 0,
        empty: "",
        falseValue: false,
        nullValue: null,
        undefinedValue: undefined,
      })

      expect(error.getAll("zero")).toEqual([0])
      expect(error.getAll("empty")).toEqual([""])
      expect(error.getAll("falseValue")).toEqual([false])
      expect(error.getAll("nullValue")).toEqual([null])
      expect(error.getAll("undefinedValue")).toEqual([undefined])
    })

    test("retrieves values from error chain", () => {
      const deepError = err("Deep error").ctx({ deepKey: "foo" })
      const middleError = err("Middle error", deepError).ctx({ middleKey: "bar" })
      const topError = err("Top error", middleError).ctx({ topKey: "baz" })

      expect(topError.getAll("deepKey")).toEqual(["foo"])
      expect(topError.getAll("middleKey")).toEqual(["bar"])
      expect(topError.getAll("topKey")).toEqual(["baz"])
    })

    test("retrieves all values for shared keys in shallowest to deepest order", () => {
      const deepError = err("Deep error").ctx({ shared: "deep" })
      const middleError = err("Middle error", deepError).ctx({ shared: "middle" })
      const topError = err("Top error", middleError).ctx({ shared: "top" })

      expect(topError.getAll<string>("shared")).toEqual(["top", "middle", "deep"])
    })

    test("handles gaps in the error chain", () => {
      const deepError = err("Deep error").ctx({ shared: "deep" })
      const middleError = err("Middle error", deepError).ctx({ otherKey: "other" })
      const topError = err("Top error", middleError).ctx({ shared: "top" })

      expect(topError.getAll("shared")).toEqual(["top", "deep"])
    })
  })
})

describe("errWithCtx", () => {
  test("creates an error with predefined context", () => {
    const scopedErr = errWithCtx({ scope: "foo" })
    const error = scopedErr("Base message")

    expectErr(error)

    expect(error.messageChain).toBe("Base message")
    expect(error.context).toEqual({ scope: "foo" })
  })

  test("passes cause to the error", () => {
    const scopedErr = errWithCtx({ scope: "foo" })
    const cause = new Error("cause message")
    const error = scopedErr("Base message", cause)

    expectErr(error)

    expect(error.messageChain).toBe("Base message -> cause message")
    expect(error.cause).toBe(cause)
    expect(error.context).toEqual({ scope: "foo" })
  })

  test("allows adding additional context", () => {
    const scopedErr = errWithCtx({ scope: "foo" })
    const error = scopedErr("Base message").ctx({ bar: 123 })

    expectErr(error)

    expect(error.messageChain).toBe("Base message")
    expect(error.context).toEqual({ scope: "foo", bar: 123 })
  })

  test("works with error chaining", () => {
    const fooErr = errWithCtx({ scope: "foo" })
    const barErr = errWithCtx({ scope: "bar" })

    const fooError = fooErr("foo error")
    const barError = barErr("bar error", fooError)

    expectErr(barError)

    expect(barError.messageChain).toBe("bar error -> foo error")
    expect(barError.getAll("scope")).toEqual(["bar", "foo"])
  })
})

describe("integration", () => {
  test("attempt and err work together", async () => {
    const result = await attempt(async () => {
      throw new Error("Original error")
    })

    expectErr(result)

    expect(result.messageChain).toBe("Original error")
  })

  test("handles nested error chains", async () => {
    const deepError = new Error("Deep error")
    const middleError = new Error("Middle error", { cause: deepError })

    const result = await attempt(async () => {
      throw middleError
    })

    expectErr(result)

    expect(result.messageChain).toBe("Middle error -> Deep error")
  })

  test("complete example", async () => {
    const connectSpy = spyOn(db, "connect").mockImplementation(() => {
      throw new Error("invalid dbId")
    })

    const connectErrorFakeLoggerOutput = await exampleMainWrapper()

    expect(connectErrorFakeLoggerOutput).toBe(
      "<timestamp1> [main|connect] something went wrong -> failed to get meetings -> failed to connect to database -> invalid dbId",
    )

    connectSpy.mockRestore()

    const querySpy = spyOn(db, "query").mockImplementation(() => {
      throw new Error("invalid query")
    })

    const queryErrorFakeLoggerOutput = await exampleMainWrapper()

    expect(queryErrorFakeLoggerOutput).toBe(
      "<timestamp2> [main|query] something went wrong -> failed to get meetings -> failed to query db -> invalid query: for 'SELECT * FROM meetings WHERE scheduled_time < actual_end_time'",
    )

    querySpy.mockRestore()
  })
})
