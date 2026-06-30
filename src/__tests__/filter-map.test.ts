// oxlint-disable typescript/require-await unicorn/no-useless-undefined vitest/no-conditional-in-test
import { describe, expect, it } from "vitest"

import { err } from "#/ctx-error.ts"
import { filterMap } from "#/filter-map.ts"

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
