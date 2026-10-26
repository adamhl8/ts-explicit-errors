<h1 align="center"><img align="top" style="color:#36BCF7; width:38px; height:38px;" src="https://raw.githubusercontent.com/adamhl8/ts-explicit-errors/refs/heads/main/assets/logo.svg"> ts-explicit-errors</h1>

A concise and type-safe error handling library for TypeScript that allows you to treat errors as values so you can write more safe, readable, and maintainable code.

- Zero dependencies
- Small, easy to understand API
- Attach and retrieve context data from errors
- Keeps the original errors, so their properties, methods, and `instanceof` still work

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
  - [`errWithCtx` Function](#errwithctx-function)
  - [Reading Errors](#reading-errors)
  - [`filterMap` Function](#filtermap-function)
- [Example](#example)

<!-- tocstop -->

## Installation

```bash
bun add ts-explicit-errors
# npm install ts-explicit-errors
```

## Usage

Use the `attempt` function to handle potential thrown errors from code you don't control:

```ts
import { attempt } from "ts-explicit-errors"

const config = attempt(() => fs.readFileSync("config.json"))
// config is either the value or the thrown error
```

Handle the result:

```ts
import { attempt, err, isErr } from "ts-explicit-errors"

// in some function...
const config = attempt(() => fs.readFileSync("config.json"))
if (isErr(config)) return err("failed to read config file", config)
// we pass 'config' (which we know is an error here) as the cause

console.log(`Config: ${config}`) // if we got here, 'config' is no longer an error
```

Throughout your codebase, your functions should return a `Result`, which is either the value or an error:

```ts
import type { Result } from "ts-explicit-errors"
import { attempt, err, isErr } from "ts-explicit-errors"

function getConfig(): Result<Record<string, unknown>> {
  const rawConfig = attempt(() => fs.readFileSync("config.json", "utf8"))
  if (isErr(rawConfig)) return err("failed to read config file", rawConfig)

  const parsedConfig = attempt(() => JSON.parse(rawConfig))
  if (isErr(parsedConfig)) return err("failed to parse config", parsedConfig)

  return parsedConfig
}
```

At some point, you'll want to handle the error chain. Use `messageChain` to log the error and all of its causes:

```ts
import { isErr, messageChain } from "ts-explicit-errors"

// getConfig() function from above...

const config = getConfig() // config is a Result (the parsed config object or an Error)
if (isErr(config)) {
  console.error(messageChain(config))
  // (if 'fs.readFileSync' failed): failed to read config file -> ENOENT: no such file or directory, open 'config.json'
  // (if 'JSON.parse' failed):      failed to parse config -> SyntaxError: JSON Parse error
  process.exit(1)
}

// do something with config...
```

You can also add context to errors to help with debugging and logging:

```ts
import type { Result } from "ts-explicit-errors"
import { attempt, err, getContext, isErr, messageChain } from "ts-explicit-errors"

async function getUserById(id: number): Promise<Result<User>> {
  const user = await attempt(async () => db.findUser(id))

  // add context to the error before returning it
  if (isErr(user)) return err("failed to find user", user, { userId: id, timestamp: new Date().toISOString() })

  return user
}

const user = await getUserById(123)
if (isErr(user)) {
  console.error(messageChain(user))
  // get the context for logging or debugging
  console.log(`Error for user ID: ${getContext(user, "userId")}`)
  console.log(`Timestamp: ${getContext(user, "timestamp")}`)
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

However, these libraries tend to be considerably more complex and have a much larger API surface. In contrast, `ts-explicit-errors` is only ~150 lines of code, and its errors are plain `Error`s.

## API

In an effort to keep the API concise, `ts-explicit-errors` only exports a few things:

- `Result` Type
- `isErr` Function
- `attempt` Function
- `err` Function
- `errWithCtx` Function
- Reading errors: `messageChain`, `rootStack`, `getContext`, `getAllContext`, and `findCause` Functions
- `filterMap` Function

---

### `Result` Type

```ts
type Result<T = void> = T | Error
```

`Result` represents a value or an `Error`.

The main idea is that **when you would normally write a function that returns `T`, you should instead return `Result<T>`.**

- Any `Error` is a valid error value: one you created with [`err`](#err-function), or the original error from [`attempt`](#attempt-function)
- If your function doesn't return anything (i.e. `undefined`) other than an error, you can use `Result` without a type argument since `void` is the default

  ```ts
  function validateData(data: string): Result {
    if (data.length < 10) return err("data is too short", undefined)
  }

  const error = validateData("short")
  // Using `isErr` would be redundant here since this is either `undefined` or an `Error`, so a truthy check is all that is needed
  if (error) // handle the `Error`
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
    return err("division by zero", undefined)
  }
  return a / b
}

const result = divide(10, 0)
if (isErr(result)) {
  console.error(`failed to divide: ${messageChain(result)}`) //  "failed to divide: division by zero"
} else {
  console.log(result)
}
```

---

### `isErr` Function

```ts
function isErr(value: unknown): value is Error
```

`isErr` checks if a value is an `Error`. It narrows a `Result<T>` to `Error` or `T`.

```ts
const result = attempt(() => mayThrow())
if (isErr(result)) {
  // result is an Error
  console.error(messageChain(result))
} else {
  // result is of type T
  console.log(result)
}
```

It also works as a callback:

```ts
const results: Result<number>[] = await Promise.all(ids.map(processItem))
const errors = results.filter(isErr) // Error[]
```

**Note:** if your `T` is itself an `Error` type, `isErr` treats the value as an error.

---

### `attempt` Function

```ts
function attempt<T>(fn: () => Promise<T>): Promise<Result<T>>
function attempt<T>(fn: () => T): Result<T>
```

`attempt` executes a function, _catches any errors thrown_, and returns either the value or the thrown error.

**It is generally used for functions that _you don't control_ which might throw an error**.

- The thrown error is returned unchanged, so its own properties, methods, and `instanceof` still work
- If the thrown value isn't an `Error` (e.g. `throw "oops"`), it's returned as an `Error` whose `cause` is the original value
- Use `attempt` as far down the call stack as possible so that thrown errors are handled at their source

```ts
// in some function that returns a Result
const result = attempt(() => fs.readFileSync("non-existent.json"))
if (isErr(result)) {
  return err("failed to read file", result)
}
// do something with `result`
```

It's recommended to wrap the error with [`err`](#err-function) before returning it, so the message says what you were doing when it failed:

```
# returned directly
ENOENT: no such file or directory, open 'config.json'

# wrapped with err
failed to read config -> ENOENT: no such file or directory, open 'config.json'
```

The provided function can be either synchronous or asynchronous.

- If the function is async / returns a Promise, `attempt` returns a `Promise` that should be `await`ed

```ts
// fs.readFile returns a Promise
const result = await attempt(() => fs.readFile("file.txt"))
```

---

### `err` Function

```ts
function err(message: string, cause: Error | undefined, context?: Record<string, unknown>): Error
```

`err` takes a message, a cause, and optional context, and returns a new `Error`.

- If there is no cause, you must explicitly pass `undefined` as the cause
- The context is stored on the new error. Read it back with [`getContext`](#getcontext-function) or [`getAllContext`](#getallcontext-function).

```ts
const error = err("failed to process request", originalError, { requestId: "abc-123" })

getContext(error, "requestId") // "abc-123"
```

---

### `errWithCtx` Function

```ts
function errWithCtx(
  defaultContext: Record<string, unknown>,
): (message: string, cause: Error | undefined, context?: Record<string, unknown>) => Error
```

Creates an [`err`](#err-function) function with predefined context. This is useful when you want to create multiple errors with the same context, such as a common scope or component name.

- Context passed to the returned function is merged over the predefined context

```ts
const serviceErr = errWithCtx({ scope: "userService" })

function getUserById(id: number): Result<User> {
  const user = attempt(() => db.findUser(id))

  // No need to manually add the scope context every time
  if (isErr(user)) return serviceErr("failed to find user", user, { userId: id })

  return user
}

// The error will have { scope: "userService", userId: id } as its context
```

---

### Reading Errors

These functions take any `Error` and read the error chain: the error itself, then its `cause`, then that error's `cause`, and so on.

- The chain can contain any errors, including ones from code you don't control
- Context is only read from errors created with [`err`](#err-function). A `context` property on any other error is ignored.

#### `messageChain` Function

```ts
function messageChain(error: Error): string
```

The full error message, which contains all of the error messages in the error chain (the error and all its causes).

- This is formatted as: `message -> cause1 -> cause2 -> ... -> causeN`
- Messages are prefixed with the error's name when it isn't `Error` (e.g. `SyntaxError: ...`)
- Blank messages are skipped

```ts
// imagine these errors are propagated up through various function calls
const deepError = err("failed to connect to database", undefined)
const middleError = err("failed to do the thing", deepError)
const topError = err("failed to process request", middleError)

console.log(messageChain(topError))
// "failed to process request -> failed to do the thing -> failed to connect to database"
```

#### `rootStack` Function

```ts
function rootStack(error: Error): string
```

The stack trace of the error chain.

**Note:** This is the stack trace from the last/deepest error in the chain. This is probably what you want since this gives you the full stack trace of the error chain.

#### `getContext` Function

```ts
function getContext<T>(error: Error, key: string): T | undefined
```

Retrieves a context value from the error chain, prioritizing the deepest value.

```ts
// imagine these errors are propagated up through various function calls
const deepError = err("failed to connect to database", undefined, { logScope: "database" })
const middleError = err("failed to do the thing", deepError, { logScope: "service" })
const topError = err("failed to process request", middleError, { logScope: "controller" })

console.log(getContext(topError, "logScope")) // "database" (from deepError)
```

#### `getAllContext` Function

```ts
function getAllContext<T>(error: Error, key: string): T[]
```

Retrieves all context values for a given key from the error chain.

- Values are returned in order from shallowest (the error) to deepest (root cause)
- Unlike `getContext` which returns the deepest value, this returns all values as an array

```ts
// using the errors from the getContext example
console.log(getAllContext(topError, "logScope")) // ["controller", "service", "database"]
```

#### `findCause` Function

```ts
function findCause<E extends Error>(error: Error, ErrorClass: abstract new (...args: never[]) => E): E | undefined
```

Finds the first error in the error chain that is an instance of `ErrorClass`.

- Errors are checked from shallowest (the error itself) to deepest (root cause)
- The match is typed as an instance of `ErrorClass`, so you can read its properties directly

This is how you get back to the original error after it has been wrapped:

```ts
import { $ } from "bun"

async function deploy(): Promise<Result<string>> {
  const result = await attempt(() => $`deploy.sh`.quiet().text())
  if (isErr(result)) return err("failed to deploy", result)
  return result
}

// higher up
const error = await deploy()
if (isErr(error)) {
  const shellError = findCause(error, $.ShellError)
  if (shellError) console.error(`exit code ${shellError.exitCode}: ${shellError.stderr.toString()}`)
}
```

---

### `filterMap` Function

`filterMap` maps over an array/iterable, calling the provided function on each element. Returns an object containing the mapped elements array (`values`) and `errors` array (if any).

- Returning `undefined` in the function excludes that element from the `values` array.
- Returning an `Error` (usually via [`err`](#err-function)) collects the error into the `errors` array.

```ts
const filePaths = ["file1.txt", "file2.txt", "file3.txt"]

const { values, errors } = await filterMap(filePaths, async (filePath) => {
  const result = await processFile(filePath) // processFile returns a Result
  if (isErr(result)) return result // appended to the `errors` array
  if (!result) return // filtered out
  return result // appended to the `values` array
})

if (errors) {
  console.error(`Failed to process ${errors.length} files`)
  errors.forEach((error) => console.error(messageChain(error)))
}

console.log(`Successfully processed ${values.length} files`)
```

The provided function can be either synchronous or asynchronous.

- If the function is async / returns a Promise, the returned value will be a `Promise` and should be `await`ed

```ts
// synchronous usage
const { values, errors } = filterMap([1, 2, 3], (n) => {
  if (n === 2) return err("invalid number", undefined)
  return n * 2
})
```

---

## Example

This example is a bit contrived, but use your imagination :)

Putting it all together:

```ts
import type { Result } from "ts-explicit-errors"
import { attempt, err, getAllContext, getContext, isErr, messageChain } from "ts-explicit-errors"

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
    return err("failed to connect to database", result, {
      timestamp: "<timestamp1>", // pretend this is something like new Date().toISOString()
      logScope: "connect",
    })
  }
}

// A function that returns a `Result` of a specific type
async function queryDb(queryString: string): Promise<Result<DbQuery>> {
  const connectToDbError = connectToDb("db-prod-1")
  // Using `isErr` would be redundant here since `connectToDbError` is either `undefined` or an `Error`, so a truthy check is all that is needed
  if (connectToDbError) {
    // We don't need to provide an additional message or context here, so we return the error directly
    return connectToDbError
  }

  const queryResult = await attempt(() => db.query(queryString))
  if (isErr(queryResult)) {
    return err("failed to query db", queryResult, { queryString, logScope: "query", timestamp: "<timestamp2>" })
  }

  return queryResult
}

async function main(): Promise<Result<Meeting[]>> {
  const meetingsQueryResult = await queryDb("SELECT * FROM meetings WHERE scheduled_time < actual_end_time")
  if (isErr(meetingsQueryResult)) {
    return err("failed to get meetings", meetingsQueryResult, { logScope: "main" })
  }

  return meetingsQueryResult
}

const result = await main()
if (isErr(result)) {
  const fullContext = {
    logScope: getAllContext<string>(result, "logScope").join("|"),
    timestamp: getContext<string>(result, "timestamp") ?? "",
    queryString: getContext<string>(result, "queryString") ?? "",
  }

  logger.error(`something went wrong -> ${messageChain(result)}`, fullContext)
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
