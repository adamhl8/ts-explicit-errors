# ts-explicit-errors

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/ts-explicit-errors.svg)](https://www.npmjs.com/package/ts-explicit-errors)

A concise and type-safe error handling library for TypeScript that allows you to treat errors as values so you can write more safe, readable, and maintainable code.

- Zero dependencies (the whole library is only ~100 LoC)
- Small, easy to understand API
- Attach and retrieve context data from errors

---

<!-- toc -->

- [Installation](#installation)
- [Usage](#usage)
- [Rationale](#rationale)
- [API](#api)
  - [`Result` Type](#result-type)
  - [`isErr` Function](#iserr-function)
  - [`attempt` Function](#attempt-function)
  - [`err` Function](#err-function)
  - [`CtxError` Class](#ctxerror-class)
    - [`messageChain`](#messagechain)
    - [`rootStack`](#rootstack)
    - [`ctx` Method](#ctx-method)
    - [`get` Method](#get-method)
    - [`getAll` Method](#getall-method)
  - [`errWithCtx` Function](#errwithctx-function)
- [Example](#example)

<!-- tocstop -->

## Installation

```bash
bun add ts-explicit-errors
# npm install ts-explicit-errors
```

## Usage

Use the [`attempt` function](#attempt-function) to handle potential thrown errors from code you don't control:

```ts
import { attempt } from "ts-explicit-errors"

const config = attempt(() => fs.readFileSync("config.json"))
// config is either the value or an error
```

Handle the result:

```ts
import { attempt, err, isErr } from "ts-explicit-errors"

// in some function...
const config = attempt(() => fs.readFileSync("config.json"))
if (isErr(config)) return err("failed to read config file", config) // we pass 'config' (which we know is an error here) as the cause

console.log(`Config: ${config}`) // 'config' is no longer an error
```

Throughout your codebase, your functions should return a `Result`, which is either the value or an error:

```ts
import type { Result } from "ts-explicit-errors"
import { attempt, err, isErr } from "ts-explicit-errors"

function getConfig(): Result<string> {
  const rawConfig = attempt(() => fs.readFileSync("config.json"))
  if (isErr(rawConfig)) return err("failed to read config file", rawConfig)

  const parsedConfig = attempt(() => JSON.parse(rawConfig))
  if (isErr(parsedConfig)) return err("failed to parse config", parsedConfig)

  return parsedConfig
}
```

At some point, you'll want to handle the error chain. Use `messageChain` to log the error and all of its causes:

```ts
// getConfig() function from above...

const config = getConfig()
if (isErr(config)) {
  console.error(config.messageChain)
  // (if 'fs.readFileSync' failed): failed to read config file -> ENOENT: no such file or directory, open 'config.json'
  // (if 'JSON.parse' failed):      failed to parse config -> SyntaxError: JSON Parse error
  process.exit(1)
}

// do something with config...
```

You can also add context to errors to help with debugging and logging:

```ts
function getUserById(id: number): Promise<Result<User>> {
  const user = await attempt(async () => db.findUser(id))

  if (isErr(user)) {
    // add context to the error before returning it
    return err("failed to find user", user).ctx({
      userId: id,
      timestamp: new Date().toISOString(),
    })
  }

  return user
}

const user = await getUserById(123)
if (isErr(user)) {
  console.error(user.messageChain)
  // get the context for logging or debugging
  console.log(`Error for user ID: ${user.get("userId")}`)
  console.log(`Timestamp: ${user.get("timestamp")}`)
} else console.log(`Hello, ${user.name}!`)
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

However, these libraries tend to be considerably more complex and have a much larger API surface. In contrast, `ts-explicit-errors` is only ~100 lines of code.

## API

In an effort to keep the API concise, `ts-explicit-errors` only exports a few things:

- `Result` Type
- `isErr` Function
- `attempt` Function
- `err` Function
  - The `CtxError` Class is also exported but should generally be accessed via `err`
- `errWithCtx` Function

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
  console.error(`failed to divide: ${result.messageChain}`) //  "failed to divide: division by zero"
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
  console.error(result.messageChain)
} else {
  // result is of type T
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
err(message: string, cause?: Error): CtxError
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

#### `messageChain`

The full error message, which contains all of the error messages in the error chain (this error and all its causes).

- This is formatted as: `cause1 -> cause2 -> ... -> causeN`

```ts
// imagine these errors are propagated up through various function calls
const deepError = err("failed to connect to database")
const middleError = err("failed to do the thing", deepError)
const topError = err("failed to process request", middleError)

console.log(topError.messageChain)
// "failed to process request -> failed to do the thing -> failed to connect to database"
```

#### `rootStack`

The stack trace of the error chain.

**Note:** This is the stack trace from the last/deepest error in the chain. This is probably what you want since this gives you the full stack trace of the error chain.

- If you want the stack trace of the current error, use `stack`.

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

console.log(topError.get("logScope")) // "database" (from deepError)
```

#### `getAll` Method

```ts
getAll<T>(key: string): T[]
```

Retrieves all context values as an array for a given key from the entire error chain (this error and all its causes).

- Values are returned in order from shallowest (this error) to deepest (root cause)
- Unlike `get` which returns the deepest value, this returns all values as an array

```ts
// imagine these errors are propagated up through various function calls
const deepError = err("failed to connect to database").ctx({ logScope: "database" })
const middleError = err("failed to do the thing", deepError).ctx({ logScope: "service" })
const topError = err("failed to process request", middleError).ctx({ logScope: "controller" })

console.log(topError.getAll("logScope")) // ["controller", "service", "database"]
```

---

### `errWithCtx` Function

```ts
function errWithCtx(defaultContext: Record<string, unknown>): (message: string, cause?: Error) => CtxError
```

Creates a [`err`](#err-function) function with predefined context. This is useful when you want to create multiple errors with the same context, such as a common scope or component name.

```ts
const serviceErr = errWithCtx({ scope: "userService" })

function getUserById(id: number): Result<User> {
  const user = attempt(() => db.findUser(id))

  // No need to manually add the scope context every time
  if (isErr(user)) return serviceErr("failed to find user", user)

  return user
}

// The error will automatically have { scope: "userService" } in its context
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
      timestamp: "<timestamp1>", // pretend this is something like new Date().toISOString()
      logScope: "connect",
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
    return err("failed to query db", queryResult).ctx({ queryString, logScope: "query", timestamp: "<timestamp2>" })
  }

  return queryResult
}

async function main(): Promise<Result<Meeting[]>> {
  const meetingsQueryResult = await queryDb("SELECT * FROM meetings WHERE scheduled_time < actual_end_time")
  if (isErr(meetingsQueryResult)) {
    return err("failed to get meetings", meetingsQueryResult).ctx({ logScope: "main" })
  }

  return meetingsQueryResult
}

const result = await main()
if (isErr(result)) {
  const fullContext = {
    logScope: result.getAll<string>("logScope").join("|"),
    timestamp: result.get<string>("timestamp") ?? "",
    queryString: result.get<string>("queryString") ?? "",
  }

  logger.error(result.messageChain, fullContext)
} else console.log(result)
```

In the above, let's say we have some `logger` that is able to handle our context. We'll pretend that it prefixes our error message with the context as a nicely formatted string. e.g. `${timestamp} [${logScope}]`

Looking at the example, we have two situations where there could be an error: 1. `db.connect()` 2. `db.query()`

Let's see what each error would look like:

For `db.connect()`:

```
<timestamp1> [main|connect] something went wrong -> failed to get meetings -> failed to connect to database -> invalid dbId
```

For `db.query()`:

```
<timestamp2> [main|query] something went wrong -> failed to get meetings -> failed to query db -> invalid query: for 'SELECT * FROM meetings WHERE scheduled_time < actual_end_time'
```

In this case, our logger appended `: for '${queryString}'`
