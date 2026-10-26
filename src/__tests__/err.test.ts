import { describe, expect, it } from "bun:test"

import bun from "bun"

import { getContext, messageChain } from "#chain.ts"
import { err, errWithCtx } from "#err.ts"

const contextOf = (error: Error): unknown => Reflect.get(error, "context")

describe("err", () => {
  it("creates a plain Error with a cause", () => {
    const cause = new Error("cause")
    const error = err("message", cause)

    expect(error.name).toBe("Error")
    expect(Object.getPrototypeOf(error)).toBe(Error.prototype)
    expect(error.message).toBe("message")
    expect(error.cause).toBe(cause)
    expect(Object.hasOwn(err("message", undefined), "cause")).toBe(false)
  })

  it("stores a copy of the context", () => {
    const context = { foo: "bar" }
    const error = err("message", undefined, context)
    context.foo = "changed"

    expect(getContext(error, "foo")).toBe("bar")
    expect(contextOf(error)).toStrictEqual({ foo: "bar" })
  })

  it("shows context in JSON and inspect output", () => {
    const error = err("x", undefined, { a: 1 })

    expect(JSON.stringify(error)).toBe('{"context":{"a":1}}')
    expect(bun.inspect(error)).toContain("context")
  })

  it("hides the marker", () => {
    expect(Object.keys(err("x", undefined, { a: 1 }))).toStrictEqual(["context"])
    expect(Object.keys(err("x", undefined))).toStrictEqual([])
    expect(JSON.stringify(err("x", undefined))).toBe("{}")
  })
})

describe("errWithCtx", () => {
  it("applies defaults and lets per-call context win", () => {
    const scopedErr = errWithCtx({ scope: "a", k: 1 })
    const error = scopedErr("m", undefined, { k: 2 })

    expect(contextOf(error)).toStrictEqual({ scope: "a", k: 2 })
  })

  it("creates an error with predefined context", () => {
    const error = errWithCtx({ scope: "foo" })("Base message", undefined)

    expect(messageChain(error)).toBe("Base message")
    expect(contextOf(error)).toStrictEqual({ scope: "foo" })
  })

  it("passes cause to the error", () => {
    const cause = new Error("cause message")
    const error = errWithCtx({ scope: "foo" })("Base message", cause)

    expect(messageChain(error)).toBe("Base message -> cause message")
    expect(error.cause).toBe(cause)
    expect(contextOf(error)).toStrictEqual({ scope: "foo" })
  })

  it("allows adding additional context", () => {
    const error = errWithCtx({ scope: "foo" })("Base message", undefined, { bar: 123 })

    expect(contextOf(error)).toStrictEqual({ scope: "foo", bar: 123 })
  })
})
