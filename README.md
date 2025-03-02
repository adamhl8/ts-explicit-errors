# ts-explicit-errors

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/ts-explicit-errors.svg)](https://www.npmjs.com/package/ts-explicit-errors)

A concise and type-safe error handling library for TypeScript that provides explicit error handling with added support for error context.

- Zero dependencies (the whole library is only ~60 LoC)
- Small, easy to understand API
- Attach and retrieve context data from errors

This allows you to treat errors as values so you can write more safe, readable, and maintainable code.

---

- [Installation](#installation)
- [Usage](#usage)
- [Rationale](#rationale)
- [API](#api)
  - [`Result` Type](#result-type)
  - [`isErr` Function](#iserr-function)
  - [`attempt` Function](#attempt-function)
  - [`err` Function](#err-function)
  - [`CtxError` Class](#ctxerror-class)
    - [`ctx` Method](#ctx-method)
    - [`get` Method](#get-method)
    - [`fmtErr` Method](#fmterr-method)
- [Example](#example)

## Installation

```bash
bun add ts-explicit-errors
# npm install ts-explicit-errors
```

## Usage

```ts
import type { Result } from "ts-explicit-errors"

import { attempt, err, isErr } from "ts-explicit-errors"

function getUserById(id: number): Result<User> {
  // Use the attempt function to handle potential thrown errors from external code
  const result = attempt(() => db.findUser(id))
  // pretend that db.findUser throws an Error with the message: "failed to connect to database"

  if (isErr(result)) return err("failed to find user", result)

  return result
}

const result = getUserById(123)
if (isErr(result)) console.error(result.fmtErr())
// "failed to find user -> failed to connect to database"
else console.log(`Hello, ${result.name}!`)
```

You can also add context to errors to help with debugging and logging:

```ts
function getUserById(id: number): Result<User> {
  const result = attempt(() => db.findUser(id))

  if (isErr(result)) {
    // Add context to the error before returning it
    return err("failed to find user", result).ctx({
      userId: id,
      operation: "findUser",
      timestamp: new Date().toISOString(),
    })
  }

  return result
}

const result = getUserById(123)
if (isErr(result)) {
  console.error(result.fmtErr()) // "failed to find user -> failed to connect to database"

  // Get the context for logging or debugging
  console.log(`Error for user ID: ${result.get("userId")}`)
  console.log(`Operation: ${result.get("operation")}`)
  console.log(`Timestamp: ${result.get("timestamp")}`)
} else console.log(`Hello, ${result.name}!`)
```

Errors are propagated up the call stack which helps build more useful error messages.

If applied correctly and consistently, all errors throughout your codebase are checked and handled immediately.

Please see the [API](#api) description for more details and examples. Also see [Example](#example) for a more in-depth example.

## Rationale

Many modern programming languages treat errors as values, and for good reason. It leads to more reliable and maintainable code by forcing error handling to be explicit. In other words, it almost completely eliminates runtime crashes due to unhandled exceptions, which is a very common problem in JS/TS.

As an alternative, there are many other libraries available that are inspired by Rust's `Result` type. Just to name a few:

- [supermacro/neverthrow](https://github.com/supermacro/neverthrow)
- [vultix/ts-results](https://github.com/vultix/ts-results)
- [badrap/result](https://github.com/badrap/result)
- [everweij/typescript-result](https://github.com/everweij/typescript-result)

However, these libraries tend to be considerably more complex and have a much larger API surface. In contrast, `ts-explicit-errors` is only ~60 lines of code.

## API

In an effort to keep the API concise, `ts-explicit-errors` only exports a few things:

- `Result` Type
- `isErr` Function
- `attempt` Function
- `err` Function
  - The `CtxError` Class is also exported but should generally be accessed via `err`

---

### `Result` Type

```ts
type Result<T = void> = T | CtxError
```

`Result` represents a value or a `CtxError`.

The main idea is that **when you would normally write a function that returns `T`, you should instead return `Result<T>`.**

- If your function doesn't return anything (i.e. `undefined`) other than an error, you can use `Result` without a type argument since `void` is the default

  ```ts
  function validateData(data: string): Result {
    if (data.length < 10) return err("data is too short")
    // validate data...
  }

  const error = validateData("short")
  // Using `isErr` would be redundant here since this is either `undefined` or a `CtxError`, so a truthy check is all that is needed
  if (error) // handle the `CtxError`
  ```

Instead of this:

```ts
function divide(a: number, b: number): number {
  if (b === 0) {
    throw new Error("division by zero")
  }
  return a / b
}

try {
  const result = divide(10, 0)
  console.log(result)
} catch (err) {
  console.error("failed to divide", err)
}
```

Use `Result`:

```ts
function divide(a: number, b: number): Result<number> {
  if (b === 0) {
    return err("division by zero")
  }
  return a / b
}

const result = divide(10, 0)
if (isErr(result)) {
  console.error(result.fmtErr("failed to divide")) //  "failed to divide -> division by zero"
} else {
  console.log(result)
}
```

---

### `isErr` Function

```ts
function isErr<T>(result: Result<T>): result is CtxError
```

`isErr` checks if a value is an instance of `CtxError`.

- This is a wrapper around `result instanceof CtxError` to make type narrowing more concise

```ts
const result = attempt(() => mayThrow())
if (isErr(result)) {
  // result is a CtxError
  console.error(result.fmtErr())
} else {
  // result is of type T
  console.log(result)
}
```

If you have a function that returns `Result<void>` (the default when `Result` is not given a type argument), you don't need to use `isErr`.

```ts
function validateData(data: string): Result {
  if (data.length < 10) return err("data is too short")
}

const result = validateData("short")
// Redundant
if (isErr(result)) console.error(result.fmtErr())
```

In this case, `result` is either `undefined` or a `CtxError`, so a truthy check is all that is needed.

```ts
// Note how we also name this `error` instead of `result` which is a bit more clear
const error = validateData("short")
if (error) console.error(error.fmtErr())
```

---

### `attempt` Function

`attempt` executes a function, _catches any errors thrown_, and returns a `Result`.

**It is generally used for functions that _you don't control_ which might throw an error**.

- Use `attempt` to "force" functions to return a `Result` so error handling remains consistent
- Another way to think about this is that `attempt` should be used as far down the call stack as possible so that thrown errors are handled at their source

```ts
// in some function that returns a Result
const result = attempt(() => fs.readFileSync("non-existent.json"))
if (isErr(result)) {
  return err("failed to read file", result)
}
// do something with `result`
```

The function can be either synchronous or asynchronous.

- If the function is async / returns a Promise, the returned `Result` will be a `Promise` and should be `await`ed

```ts
// fs.readFile returns a Promise
const result = await attempt(() => fs.readFile("file.txt"))
```

---

### `err` Function

```ts
err(message: string, cause?: unknown): CtxError
```

`err` takes a message and a cause (optional) and returns a new [`CtxError`](#ctxerror-class).

- This is a wrapper around `new CtxError()` to make creating errors more concise

```ts
const error = err("something went wrong", originalError)
```

Equivalent to:

```ts
const error = new CtxError("something went wrong", { cause: originalError })
```

---

### `CtxError` Class

`CtxError` is a custom error class that extends the built-in `Error` class with additional functionality.

- All instances of `CtxError` are instances of `Error`, so using them in place of `Error` won't cause any issues.

#### `ctx` Method

```ts
ctx(context: Record<string, unknown>): CtxError
```

Adds context to the error.

```ts
const error = err("failed to process request").ctx({ requestId: "abc-123" })

console.log(error.context) // { requestId: "abc-123" }
```

If the error already has context, the new context will be merged over the existing context.

```ts
const error = err("failed to process request").ctx({ requestId: "abc-123", userId: 123 })
// ... later on
error.ctx({ requestId: "cba-321" })

console.log(error.context) // { requestId: "cba-321", userId: 123 }
```

#### `get` Method

```ts
get<T>(key: string): T | undefined
```

Retrieves a context value from the error chain (this error and all its causes), prioritizing the deepest value.

```ts
// imagine these errors are propagated up through various function calls
const deepError = err("failed to connect to database").ctx({ logScope: "database" })
const middleError = err("failed to do the thing", deepError).ctx({ logScope: "service" })
const topError = err("failed to process request", middleError).ctx({ logScope: "controller" })

console.log(topError.get("scope")) // "database" (from deepError)
```

#### `fmtErr` Method

```ts
fmtErr(message?: string): string
```

Returns a nicely formatted error message by unwrapping all error messages in the error chain (this error and all its causes).

- The error message is formatted as: `message -> cause1 -> cause2 -> ... -> causeN`
- An optional message can be provided which will be the first message in the string

```ts
// imagine these errors are propagated up through various function calls
const deepError = err("failed to connect to database")
const middleError = err("failed to do the thing", deepError)
const topError = err("failed to process request", middleError)

console.log(topError.fmtErr())
// "failed to process request -> failed to do the thing -> failed to connect to database"

// With the optional message given
console.log(topError.fmtErr("something went wrong"))
// "something went wrong -> failed to process request -> failed to do the thing -> failed to connect to database"
```

---

## Example

This example is a bit contrived, but use your imagination :)

Putting it all together:

```ts
import type { Result } from "ts-explicit-errors"

import { attempt, err, isErr } from "ts-explicit-errors"

// Pretend this "db" module doesn't belong to us and its functions might throw errors
const db = {
  connect: (dbId: string) => {
    throw new Error("invalid dbId")
  },
  query: (queryString: string) => {
    throw new Error("invalid query")
  },
}

// This function doesn't return a value (other than a possible error), so we use `Result` without a type argument
function connectToDb(dbId: string): Result {
  const result = attempt(() => db.connect(dbId))
  if (isErr(result)) {
    return err("failed to connect to database", result).ctx({
      timestamp: new Date().toISOString(),
      logScope: "db-connect",
    })
  }
}

// A function that returns a `Result` of a specific type
async function queryDb(queryString: string): Promise<Result<DbQuery>> {
  const connectToDbError = connectToDb("db-prod-1")
  // Using `isErr` would be redundant here since `connectToDbError` is either `undefined` or a `CtxError`, so a truthy check is all that is needed
  if (connectToDbError) {
    // We don't need to provide an additional message or context here, so we return the error directly
    return connectToDbError
  }

  const queryResult = await attempt(() => db.query(queryString))
  if (isErr(queryResult)) {
    return err("failed to query db", queryResult).ctx({ queryString, logScope: "db-query" })
  }

  return queryResult
}

async function main(): Promise<Result<Meeting[]>> {
  const meetingsResult = await queryDb("SELECT * FROM meetings WHERE scheduled_time < actual_end_time")
  if (isErr(meetingsResult)) {
    return err("failed to get meetings", meetingsResult).ctx({ logScope: "main" })
  }

  return meetingsResult
}

const result = await main()
if (isErr(result)) {
  logger.error(result.fmtErr("something went wrong"), result) // we pass the error so the logger can call .get() to get the context
} else console.log(result)
```

In the above, let's say we have some `logger` that is able to handle our context. We'll pretend that it prefixes our error message with the context as a nicely formatted string. e.g. `${timestamp}[${logScope}]`

Looking at the example, we have two situations where there could be an error: 1. `db.connect()` 2. `db.query()`

Let's see what each error would look like:

For `db.connect()`:

```
2025-02-28T16:51:01.378Z [db-connect] something went wrong -> failed to get meetings -> failed to connect to database -> invalid dbId
```

For `db.query()`:

```
[db-query] something went wrong -> failed to get meetings -> failed to query db -> invalid query: for 'SELECT \* FROM meetings WHERE scheduled_time < actual_end_time'
```

In this case, our logger appended `: for '${queryString}'`

Note that in both cases, the "deeper" `logScope` won.
