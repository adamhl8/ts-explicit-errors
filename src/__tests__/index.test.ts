/** biome-ignore-all lint/style/useThrowOnlyError: for tests */
/** biome-ignore-all lint/suspicious/useErrorMessage: for tests */
/** biome-ignore-all lint/suspicious/useAwait: for tests */
import { describe, expect, spyOn, test } from "bun:test"

import { db, exampleMainWrapper } from "@/__tests__/example.js"
import type { CtxError, Result } from "@/index.js"
import { attempt, err, errWithCtx, isErr } from "@/index.js"

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

    expect(result.fmtErr()).toBe("sync error")
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

    expect(result.fmtErr()).toBe("async error")
  })

  test("handles non-Error throws", () => {
    const result = attempt(() => {
      throwsString()
    })

    expectErr(result)

    expect(result.fmtErr()).toBe("string error")
  })
})

describe("CtxError", () => {
  describe("fmtErr", () => {
    test("formats basic error message", () => {
      const error = err("Base message")

      expect(error.fmtErr()).toBe("Base message")
    })

    test("prepends message if provided", () => {
      const error = err("Base message")

      expect(error.fmtErr("prepend message")).toBe("prepend message -> Base message")
    })

    test("formats error with cause", () => {
      const cause = new Error("Cause message")
      const error = err("Base message", cause)

      expect(error.fmtErr()).toBe("Base message -> Cause message")
    })

    test("formats error with nested causes", () => {
      const deepCause = new Error("Deep cause")
      const middleCause = new Error("Middle cause", { cause: deepCause })
      const error = err("Base message", middleCause)

      expect(error.fmtErr()).toBe("Base message -> Middle cause -> Deep cause")
    })

    test("handles non-Error causes", () => {
      const error = err("Base message", "string cause")

      expect(error.fmtErr()).toBe("Base message -> string cause")
    })

    test("includes custom error names in message and excludes Error and CtxError prefixes", () => {
      const regularError = new Error("Error message")
      const ctxError = err("CtxError message")
      const customError = new CustomError("CustomError message")

      const error1 = err("Base message", regularError)
      const error2 = err("Base message", ctxError)
      const error3 = err("Base message", customError)

      expect(error1.fmtErr()).toBe("Base message -> Error message")
      expect(error2.fmtErr()).toBe("Base message -> CtxError message")
      expect(error3.fmtErr()).toBe("Base message -> CustomError: CustomError message")
    })

    test("handles falsy cause", () => {
      const error = err("Base message", "")

      expect(error.fmtErr()).toBe("Base message")
    })

    test("excludes blank error messages", () => {
      const blankError = new Error("")
      const error = err("Base message", blankError)

      expect(error.fmtErr("")).toBe("Base message")
    })

    test("shows 'Unknown error' when all messages are blank", () => {
      const blankError = new Error("")
      const error = err("", blankError)

      expect(error.fmtErr("")).toBe("Unknown error")
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

    test("retrieves values from cause chain", () => {
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

    test("retrieves values from cause chain", () => {
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

    expect(error.fmtErr()).toBe("Base message")
    expect(error.context).toEqual({ scope: "foo" })
  })

  test("passes cause to the error", () => {
    const scopedErr = errWithCtx({ scope: "foo" })
    const cause = new Error("cause message")
    const error = scopedErr("Base message", cause)

    expectErr(error)

    expect(error.fmtErr()).toBe("Base message -> cause message")
    expect(error.cause).toBe(cause)
    expect(error.context).toEqual({ scope: "foo" })
  })

  test("allows adding additional context", () => {
    const scopedErr = errWithCtx({ scope: "foo" })
    const error = scopedErr("Base message").ctx({ bar: 123 })

    expectErr(error)

    expect(error.fmtErr()).toBe("Base message")
    expect(error.context).toEqual({ scope: "foo", bar: 123 })
  })

  test("works with error chaining", () => {
    const fooErr = errWithCtx({ scope: "foo" })
    const barErr = errWithCtx({ scope: "bar" })

    const fooError = fooErr("foo error")
    const barError = barErr("bar error", fooError)

    expectErr(barError)

    expect(barError.fmtErr()).toBe("bar error -> foo error")
    expect(barError.getAll("scope")).toEqual(["bar", "foo"])
  })
})

describe("integration", () => {
  test("attempt and err work together", async () => {
    const result = await attempt(async () => {
      throw new Error("Original error")
    })

    expectErr(result)

    expect(result.fmtErr("Operation failed")).toBe("Operation failed -> Original error")
  })

  test("handles nested error chains", async () => {
    const deepError = new Error("Deep error")
    const middleError = new Error("Middle error", { cause: deepError })

    const result = await attempt(async () => {
      throw middleError
    })

    expectErr(result)

    expect(result.fmtErr("Top error")).toBe("Top error -> Middle error -> Deep error")
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
