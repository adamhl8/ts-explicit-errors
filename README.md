# ts-error-tuple

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/ts-error-tuple.svg)](https://www.npmjs.com/package/ts-error-tuple)

A concise and type-safe error handling library for TypeScript that mimics Golang's simple and explicit error handling, with added support for error context.

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
  - [`attempt` Function](#attempt-function)
  - [`err` Function](#err-function)
  - [`CtxError` Class](#ctxerror-class)
    - [`ctx` Method](#ctx-method)
    - [`get` Method](#get-method)
    - [`fmtErr` Method](#fmterr-method)
  - [`Err` Type](#err-type)
- [Example](#example)

## Installation

```bash
bun add ts-error-tuple
# npm install ts-error-tuple
```

## Usage

This pattern should look familiar if you've used Golang:

```typescript
import type { Result } from "ts-error-tuple"

import { attempt, err } from "ts-error-tuple"

function getUserById(id: number): Result<User> {
  // Use the attempt function to handle potential thrown errors from external code
  const [user, error] = attempt(() => db.findUser(id)) // pretend that db.findUser throws an Error with the message: "failed to connect to database"

  if (error) return [undefined, err("failed to find user", error)]

  return [user, undefined]
}

const [user, error] = getUserById(123)
if (error) console.error(error.fmtErr())
// "failed to find user -> failed to connect to database"
else console.log(`Hello, ${user.name}!`)
```

You can also add context to errors to help with debugging and logging:

```typescript
function getUserById(id: number): Result<User> {
  const [user, error] = attempt(() => db.findUser(id))

  if (error) {
    // Add context to the error before returning it
    return [
      undefined,
      err("failed to find user", error).ctx({
        userId: id,
        operation: "findUser",
        timestamp: new Date().toISOString(),
      }),
    ]
  }

  return [user, undefined]
}

const [user, error] = getUserById(123)
if (error) {
  console.error(error.fmtErr()) // "failed to find user -> failed to connect to database"

  // Get the context for logging or debugging
  console.log(`Error for user ID: ${error.get("userId")}`)
  console.log(`Operation: ${error.get("operation")}`)
  console.log(`Timestamp: ${error.get("timestamp")}`)
} else console.log(`Hello, ${user.name}!`)
```

Just like is common in Golang, errors are propagated up the call stack which helps build more useful error messages.

If applied correctly and consistently, all errors throughout your codebase are checked and handled immediately.

Please see the [API](#api) description for more details and examples. Also see [Example](#example) for a more in-depth example.

## Rationale

Many modern programming languages treat errors as values, and for good reason. It leads to more reliable and maintainable code by forcing error handling to be explicit. In other words, it almost completely eliminates runtime crashes due to unhandled exceptions, which is a very common problem in JS/TS.

As an alternative, there are many other libraries available that are inspired by Rust's `Result` type. Just to name a few:

- [supermacro/neverthrow](https://github.com/supermacro/neverthrow)
- [vultix/ts-results](https://github.com/vultix/ts-results)
- [badrap/result](https://github.com/badrap/result)
- [everweij/typescript-result](https://github.com/everweij/typescript-result)

However, these libraries tend to be considerably more complex and have a much larger API surface. In contrast, `ts-error-tuple` is only ~60 lines of code.

I find Golang's approach to error handling more clear and easy to reason about, which is what this library aims to provide.

## API

In an effort to keep the API concise, `ts-error-tuple` only exports four things:

- `Result` Type
- `attempt` Function
- `err` Function
  - The `CtxError` Class is not exported and is instead accessed via `err`
- `Err` Type

---

### `Result` Type

```ts
type Result<T> = [T, undefined] | [undefined, CtxError]
```

`Result` represents a tuple that contains a value or an error.

- If the value is present, the error is `undefined`
- Conversely, if the error is present, the value is `undefined`

The main idea is that **when you would normally write a function that returns `T`, you should instead return `Result<T>`.**

- Functions that don't return anything (i.e. `undefined`) should use the [`Err`](#err-type) type instead.

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
    return [undefined, err("division by zero")]
  }
  return [a / b, undefined]
}

const [result, error] = divide(10, 0)
if (error) {
  console.error(error.fmtErr("failed to divide")) //  "failed to divide -> division by zero"
} else {
  console.log(result)
}
```

---

### `attempt` Function

`attempt` executes a function, _catches any errors thrown_, and returns a `Result`.

**It is generally used for functions that _you don't control_ which might throw an error**.

- Use `attempt` to "force" functions to return a `Result` so error handling remains consistent
- Another way to think about this is that `attempt` should be used as far down the call stack as possible so that thrown errors are handled at their source

```ts
// in some function that returns a Result
const [file, error] = attempt(() => fs.readFileSync("non-existent.json"))
if (error) {
  return [undefined, err("failed to read file", error)]
}
// do something with `file`
```

The function can be either synchronous or asynchronous.

- If the function is async / returns a Promise, the returned `Result` will be a `Promise` and should be `await`ed

```ts
// fs.readFile returns a Promise
const [file, error] = await attempt(() => fs.readFile("file.txt"))
```

In the case where a function doesn't return anything (i.e. `undefined`) but might fail, you can simply ignore the first element of the `Result`.

```ts
const [, error] = attempt(() => fs.rmSync("non-existent.txt"))
if (error) {
  console.error(error.fmtErr("failed to remove file")) // "failed to remove file -> ENOENT: no such file or directory"
}
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

### `Err` Type

```ts
type Err = CtxError | undefined
```

`Err` is a type alias for `CtxError | undefined` to make function return types more readable.

- This is used for functions that don't return a value but may return an error.

```ts
function validateData(data: string): Err {
  if (data.length < 10) {
    return err("data is too short")
  }
  // implicit return undefined
}

const error = validateData("short")
if (error) {
  console.error(error.fmtErr("failed to validate data")) // "failed to validate data -> data is too short"
}
```

## Example

This example is a bit contrived, but use your imagination :)

Putting it all together:

```ts
import type { Err, Result } from "ts-error-tuple"

import { attempt, err } from "ts-error-tuple"

// Pretend this "db" module doesn't belong to us and its functions might throw errors
const db = {
  connect: (dbId: string) => {
    throw new Error("invalid dbId")
  },
  query: (queryString: string) => {
    throw new Error("invalid query")
  },
}

// This function doesn't return a value (other than a possible error), so we use `Err`
function connectToDb(dbId: string): Err {
  // Use attempt because db.connect() might throw
  const [, error] = attempt(() => db.connect(dbId))
  if (error) {
    return err("failed to connect to database", error).ctx({
      timestamp: new Date().toISOString(),
      logScope: "db-connect",
    })
  }
  return undefined
}

// A function that returns a `Result`
async function queryDb(queryString: string): Promise<Result<DbQuery>> {
  const dbConnectionError = connectToDb("db-prod-1")
  if (dbConnectionError) {
    // We don't need to provide an additional message or context here, so we return the error directly instead of using `err`
    return [undefined, dbConnectionError]
  }

  const [data, queryError] = await attempt(() => db.query(queryString))
  if (queryError) {
    return [undefined, err("failed to query db", queryError).ctx({ queryString, logScope: "db-query" })]
  }

  return [data, undefined]
}

async function main(): Promise<Result<Meeting[]>> {
  const [meetings, meetingsQueryError] = await queryDb("SELECT * FROM meetings WHERE scheduled_time < actual_end_time")
  if (meetingsQueryError) {
    return [undefined, err("failed to get meetings", meetingsQueryError).ctx({ logScope: "main" })]
  }

  return [meetings, undefined]
}

const [result, error] = await main()
if (error) {
  logger.error(error.fmtErr("something went wrong"), error) // we pass the error so the logger can call .get() to get the context
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
