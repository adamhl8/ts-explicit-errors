import type { CtxError } from "#/ctx-error.ts"
import { isErr } from "#/ctx-error.ts"
import { isPromiseLike } from "#/util.ts"
import type { Contains, Simplify } from "#/util.ts"

type FilterMapResultValue<R> = Exclude<Awaited<R>, CtxError | undefined>

interface FilterMapResult<R> {
  values: FilterMapResultValue<R>[]
  errors: CtxError[] | undefined
}

type FilterMapReturn<R> =
  // If R (the return type of the given fn) contains a Promise
  Contains<R, PromiseLike<unknown>> extends true
    ? // then we return a Promise where all the values have been awaited
      Promise<Simplify<FilterMapResult<R>>>
    : // otherwise, we return a synchronous result
      Simplify<FilterMapResult<R>>

/**
 * Maps over an array/iterable, calling the provided function on each element. Returns an object containing the mapped
 * elements array (`values`) and `errors` array (if any).
 *
 * - Returning `undefined` in the function excludes that element from the `values` array.
 * - Returning a {@link CtxError} (usually via {@link err}) collects the error into the `errors` array.
 *
 * @param {Iterable<T>} items - Iterable to map over
 * @param {fn: (item: T, index: number) => R} fn - The function to execute for each element
 * @returns {FilterMapReturn<R>} Object containing values array and optional errors array
 */
export const filterMap = <T, R>(items: Iterable<T>, fn: (item: T, index: number) => R): FilterMapReturn<R> => {
  const mappedItems = [...items].map((item, index) => fn(item, index))

  const handleItems = (awaitedItems: Awaited<R>[]) => {
    const errors: CtxError[] = []

    const filteredItems = awaitedItems.filter((item): item is FilterMapResultValue<R> => {
      if (item === undefined) return false

      if (isErr(item)) {
        errors.push(item)
        return false
      }

      return true
    })

    return {
      values: filteredItems,
      errors: errors.length > 0 ? errors : undefined,
    }
  }

  const result = mappedItems.some(isPromiseLike)
    ? // If any item is a Promise, we await all of them
      // oxlint-disable-next-line promise/prefer-await-to-then
      Promise.all(mappedItems).then((resolvedResults) => handleItems(resolvedResults))
    : // oxlint-disable-next-line typescript/no-unsafe-type-assertion - We know at this point that all the return values are not wrapped in Promise (equivalent to Awaited<R>[])
      handleItems(mappedItems as Awaited<R>[])

  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return result as FilterMapReturn<R>
}
