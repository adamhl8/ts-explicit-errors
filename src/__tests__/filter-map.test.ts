// oxlint-disable typescript/require-await vitest/no-conditional-in-test - The mapper callbacks are test inputs, so their `async` and conditionals are deliberate.
import { describe, expect, it } from "bun:test"

import { attempt } from "#attempt.ts"
import { messageChain } from "#chain.ts"
import { err } from "#err.ts"
import { filterMap } from "#filter-map.ts"
import type { Result } from "#result.ts"

describe("filterMap", () => {
  describe("synchronous", () => {
    it("maps values successfully", () => {
      const result = filterMap([1, 2, 3], (n) => n * 2)

      expect(result.values).toStrictEqual([2, 4, 6])
      expect(result.errors).toBeUndefined()
    })

    it("filters out undefined values", () => {
      const result = filterMap([1, 2, 3, 4], (n) => {
        if (n % 2 === 0) return
        return n
      })

      expect(result.values).toStrictEqual([1, 3])
      expect(result.errors).toBeUndefined()
    })

    it("collects errors into errors array", () => {
      const result = filterMap([1, 2, 3], (n) => {
        if (n === 2) return err("error at 2", undefined)
        return n
      })

      expect(result.values).toStrictEqual([1, 3])
      expect(result.errors).toHaveLength(1)
      expect(result.errors?.[0]?.message).toBe("error at 2")
    })

    it("handles mixed results", () => {
      const result = filterMap([1, 2, 3, 4, 5], (n) => {
        if (n === 2) return
        if (n === 4) return err("error at 4", undefined)
        return n * 10
      })

      expect(result.values).toStrictEqual([10, 30, 50])
      expect(result.errors).toHaveLength(1)
      expect(result.errors?.[0]?.message).toBe("error at 4")
    })

    it("collects a plain Error returned by the callback", () => {
      const result = filterMap([1, 2], (n) => (n === 2 ? new Error("plain at 2") : n))

      const values: number[] = result.values
      const errors: Error[] | undefined = result.errors
      expect(values).toStrictEqual([1])
      expect(errors?.[0]?.message).toBe("plain at 2")
      expect(Object.hasOwn(errors?.[0] ?? {}, "context")).toBe(false)
    })

    it("collects errors from a Result callback", () => {
      const result = filterMap([1, 2], (n): Result<number> => (n === 2 ? err("ctx at 2", undefined) : n))
      const errors: Error[] | undefined = result.errors
      const [first] = errors ?? []

      expect(first && messageChain(first)).toBe("ctx at 2")
    })

    it("collects the original errors from attempt", () => {
      const boom = new TypeError("boom")
      const result = filterMap([1, 2], (n) =>
        attempt(() => {
          if (n === 2) throw boom
          return n
        }),
      )

      expect(result.values).toStrictEqual([1])
      expect(result.errors?.[0]).toBe(boom)
    })

    it("types errors as Error[] when the callback returns unknown", () => {
      const result = filterMap([1, 2], (n): unknown => (n === 2 ? new Error("unknown at 2") : n))

      expect(result.values).toStrictEqual([1])
      expect(result.errors?.[0]?.message).toBe("unknown at 2")
    })

    it("types errors as Error[] when the callback returns any", () => {
      // oxlint-disable-next-line typescript/no-explicit-any - An `any` return is the case under test.
      const result = filterMap([1, 2], (n): any => (n === 2 ? new Error("any at 2") : n))

      expect(result.errors?.[0]?.message).toBe("any at 2")
    })

    it("handles empty array", () => {
      const items: string[] = []
      const result = filterMap(items, (n) => n)

      expect(result.values).toStrictEqual([])
      expect(result.errors).toBeUndefined()
    })

    it("handles all undefined", () => {
      const result = filterMap([1, 2, 3], () => void 0)

      expect(result.values).toStrictEqual([])
      expect(result.errors).toBeUndefined()
    })

    it("handles all errors", () => {
      const result = filterMap([1, 2, 3], (n) => err(`error at ${n}`, undefined))

      expect(result.values).toStrictEqual([])
      expect(result.errors).toHaveLength(3)
      expect(result.errors?.[0]?.message).toBe("error at 1")
      expect(result.errors?.[1]?.message).toBe("error at 2")
      expect(result.errors?.[2]?.message).toBe("error at 3")
    })

    it("passes index parameter correctly", () => {
      const result = filterMap(["a", "b", "c"], (item, index) => `${item}${index}`)

      expect(result.values).toStrictEqual(["a0", "b1", "c2"])
    })
  })

  describe("asynchronous", () => {
    it("maps values successfully", async () => {
      const result = await filterMap([1, 2, 3], async (n) => n * 2)

      expect(result.values).toStrictEqual([2, 4, 6])
      expect(result.errors).toBeUndefined()
    })

    it("filters out undefined values", async () => {
      const result = await filterMap([1, 2, 3, 4], async (n) => {
        if (n % 2 === 0) return
        return n
      })

      expect(result.values).toStrictEqual([1, 3])
      expect(result.errors).toBeUndefined()
    })

    it("collects errors into errors array", async () => {
      const result = await filterMap([1, 2, 3], async (n) => {
        if (n === 2) return err("error at 2", undefined)
        return n
      })

      expect(result.values).toStrictEqual([1, 3])
      expect(result.errors).toHaveLength(1)
      expect(result.errors?.[0]?.message).toBe("error at 2")
    })

    it("handles mixed results", async () => {
      const result = await filterMap([1, 2, 3, 4, 5], async (n) => {
        if (n === 2) return
        if (n === 4) return err("error at 4", undefined)
        return n * 10
      })

      expect(result.values).toStrictEqual([10, 30, 50])
      expect(result.errors).toHaveLength(1)
      expect(result.errors?.[0]?.message).toBe("error at 4")
    })

    it("collects the original errors from an async attempt", async () => {
      const boom = new TypeError("boom")
      const result = await filterMap([1, 2], async (n) =>
        attempt(async () => {
          if (n === 2) throw boom
          return n
        }),
      )

      expect(result.values).toStrictEqual([1])
      expect(result.errors?.[0]).toBe(boom)
    })

    it("handles mixed sync/async returns", async () => {
      const result = await filterMap([1, 2, 3, 4], async (n) => {
        if (n % 2 === 0) return n * 10
        return n
      })

      expect(result.values).toStrictEqual([1, 20, 3, 40])
      expect(result.errors).toBeUndefined()
    })
  })
})
