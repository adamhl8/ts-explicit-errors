# ts-error-tuple

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/ts-error-tuple.svg)](https://www.npmjs.com/package/ts-error-tuple)

A concise and type-safe error handling library for TypeScript that mimics Golang's simple and explicit error handling.

This allows you to treat errors as values and write more safe, readable, and maintainable code.

- [Installation](#installation)
- [Usage](#usage)
  - [A More Complete Example](#a-more-complete-example)
  - [Async Functions](#async-functions)
  - [More on `fmtError`](#more-on-fmterror)

## Installation

```bash
bun add ts-error-tuple
# npm install ts-error-tuple
```

## Usage

`ts-error-tuple` exports two functions: `attempt` and `fmtError`.

```typescript
import { attempt, fmtError } from "ts-error-tuple"

const [file, err] = attempt(() => fs.readFileSync("non-existent.txt"))

if (err) {
  const error = fmtError("failed to read file", err)
  console.error(error.message)
  // failed to read file -> ENOENT: no such file or directory, open 'non-existent.txt'
} else {
  console.log("File contents:", file.toString())
}
```

- `attempt` executes a function, catches any errors thrown, and returns a `Result`, which is a tuple of the value or the error
  - If the value is present, the error is `null`
  - Conversely, if the error is present, the value is `null`
  - **It is generally used for functions that _you don't control_ which might throw an error**
- `fmtError` takes a message and optionally a cause, and returns a new `Error` with a nicely formatted message
  - All nested errors (i.e. errors attached as `cause`) are unwrapped and included in the final error message
  - This is intended to be used like Golang's `fmt.Errorf`

In the case where there is no return value but the function might fail, you can simply ignore the first element of the `Result` tuple.

```ts
const [, err] = attempt(() => fs.rmSync("non-existent.txt"))
if (err) {
  console.error(fmtError("failed to remove file", err))
}
```

---

### A More Complete Example

`ts-error-tuple` also exports the `Result` type: An array (tuple) of the value and the error.

- When you would normally write a function that returns `T`, you should instead return `Result<T>`.
  ```typescript
  type Result<T> = [T, null] | [null, Error]
  ```

Of course, functions that you don't control might still throw an error. **This is what `attempt` is for.**

- Use `attempt` to "force" functions to return a `Result` so error handling remains consistent
- Another way to think about this is that `attempt` should be used as far down the call stack as possible so that thrown errors are handled at their source

This pattern should look familiar if you've used Golang:

```typescript
import { attempt, fmtError, type Result } from "ts-error-tuple"

function getConfig(): Result<string> {
  const [configFile, err] = attempt(() => {
    const data = fs.readFileSync("config.txt")
    return data.toString()
  })

  if (err) {
    return [null, fmtError("failed to read config.txt", err)]
  }

  return [configFile, null]
}

const [config, err] = getConfig()
if (err) {
  console.error(fmtError("failed to get config", err))
} else {
  console.log("Config:", config)
}
```

Just like is common in Golang, errors are propagated up the call stack until they are handled.

If applied correctly and consistently, all errors throughout your codebase are checked and handled immediately.

---

### Async Functions

`attempt` can also take async functions. Simply await the call to `attempt`.

```typescript
// fs.readFile returns a Promise
const [file, err] = await attempt(() => fs.readFile("file.txt"))
// The rest of the code is exactly the same as the sync example
```

---

### More on `fmtError`

Creates a new `Error` with a formatted message that includes all nested error causes.

```typescript
function fmtError(message: string, cause?: unknown): Error
```

The error message is formatted as: `message -> cause1 -> cause2 -> ... -> causeN`

```typescript
const [file, err] = attempt(() => fs.readFileSync("non-existent.txt"))
if (err) {
  const secondError = fmtError("failed to read file", err)
  const finalError = fmtError("config initialization failed", secondError)
  console.error(finalError.message)
  // config initialization failed -> failed to read file -> ENOENT: no such file or directory, open 'non-existent.txt'
}
```

Sometimes there is no cause or you are creating your own error:

```ts
const [file, err] = attempt(() => fs.readFileSync("file.txt"))
if (err) {
  // handle error
}
if (file.length < 10) {
  const error = fmtError("file is too short")
  console.error(error.message)
  // file is too short
}
```
