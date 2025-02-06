import { describe, expect, test } from "bun:test"

import { attempt, fmtError } from "../index.ts"

const throwsError = () => {
  throw new Error("sync error")
}

const throwsString = () => {
  throw "string error"
}

describe("attempt", () => {
  test("handles successful synchronous operations", () => {
    const [value, error] = attempt(() => "success")

    expect(value).toBe("success")
    expect(error).toBeUndefined()
  })

  test("handles failed synchronous operations", () => {
    const [value, error] = attempt(() => {
      throwsError()
    })

    expect(value).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe("sync error")
  })

  test("handles successful async operations", async () => {
    const [value, error] = await attempt(async () => "async success")

    expect(value).toBe("async success")
    expect(error).toBeUndefined()
  })

  test("handles failed async operations", async () => {
    const [value, error] = await attempt(async () => {
      throw new Error("async error")
    })

    expect(value).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe("async error")
  })

  test("handles non-Error throws", () => {
    const [value, error] = attempt(() => {
      throwsString()
    })

    expect(value).toBeUndefined()
    expect(error).toBeInstanceOf(Error)
    expect(error?.message).toBe("string error")
  })
})

describe("fmtError", () => {
  test("formats basic error message", () => {
    const error = fmtError("Base message")

    expect(error.message).toBe("Base message")
  })

  test("formats error with cause", () => {
    const cause = new Error("Cause message")
    const error = fmtError("Base message", cause)

    expect(error.message).toBe("Base message -> Cause message")
  })

  test("formats error with nested causes", () => {
    const deepCause = new Error("Deep cause")
    const middleCause = new Error("Middle cause", { cause: deepCause })
    const error = fmtError("Base message", middleCause)

    expect(error.message).toBe("Base message -> Middle cause -> Deep cause")
  })

  test("handles non-Error causes", () => {
    const error = fmtError("Base message", "string cause")

    expect(error.message).toBe("Base message -> string cause")
  })

  test("includes custom error names in message", () => {
    class CustomError extends Error {
      public constructor(message: string) {
        super(message)
        this.name = "CustomError"
      }
    }
    const cause = new CustomError("Custom message")
    const error = fmtError("Base message", cause)

    expect(error.message).toBe("Base message -> CustomError: Custom message")
  })

  test("handles falsy cause", () => {
    const error = fmtError("Base message", "")

    expect(error.message).toBe("Base message")
  })
})

describe("integration", () => {
  test("attempt and fmtError work together", async () => {
    const [, error] = await attempt(async () => {
      throw new Error("Original error")
    })
    const formattedError = fmtError("Operation failed", error)

    expect(formattedError.message).toBe("Operation failed -> Original error")
  })

  test("handles nested error chains", async () => {
    const deepError = new Error("Deep error")
    const middleError = new Error("Middle error", { cause: deepError })

    const [, error] = await attempt(async () => {
      throw middleError
    })

    const formattedError = fmtError("Top level", error)

    expect(formattedError.message).toBe("Top level -> Middle error -> Deep error")
  })
})
