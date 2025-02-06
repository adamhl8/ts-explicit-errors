# ts-error-tuple

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://img.shields.io/npm/v/ts-error-tuple.svg)](https://www.npmjs.com/package/ts-error-tuple)

A concise and type-safe error handling library for TypeScript that mimics Golang's simple and explicit error handling.

- Zero dependencies (the whole library is only ~40 LoC)
- Small, easy to understand API

This allows you to treat errors as values so you can write more safe, readable, and maintainable code.

---

- [Installation](#installation)
- [Usage](#usage)
- [Rationale](#rationale)
- [API](#api)
  - [`Result` Type](#result-type)
  - [`attempt` Function](#attempt-function)
  - [`fmtError` Function](#fmterror-function)
  - [`Err` Type](#err-type)

## Installation

```bash
bun add ts-error-tuple
# npm install ts-error-tuple
```

## Usage

This pattern should look familiar if you've used Golang:

```typescript
import type { Result } from "ts-error-tuple"

import { attempt, fmtError } from "ts-error-tuple"

function getContent(): Result<string> {
  const [contentFile, err] = attempt(() => {
    const data = fs.readFileSync("content.txt")
    return data.toString()
  })

  if (err) {
    return [undefined, fmtError("failed to read content.txt", err)]
  }

  return [contentFile, undefined]
}

const [content, err] = getContent()
if (err) {
  const error = fmtError("failed to get content", err)
  console.error(error.message)
} else {
  console.log("Content:", content)
}
```

Just like is common in Golang, errors are propagated up the call stack which helps build more useful error messages.

If applied correctly and consistently, all errors throughout your codebase are checked and handled immediately.

Please see the [API](#api) description for more details and examples.

## Rationale

Many modern programming languages treat errors as values, and for good reason. It leads to more reliable and maintainable code by forcing error handling to be explicit. In other words, it almost completely eliminates runtime crashes due to unhandled exceptions, which is a very common problem in JS/TS.

As an alternative, there are many other libraries available that are inspired by Rust's `Result` type. Just to name a few:

- [supermacro/neverthrow](https://github.com/supermacro/neverthrow)
- [vultix/ts-results](https://github.com/vultix/ts-results)
- [badrap/result](https://github.com/badrap/result)
- [everweij/typescript-result](https://github.com/everweij/typescript-result)

However, these libraries tend to be considerably more complex and have a much larger API surface. In contrast, `ts-error-tuple` is only ~40 lines of code.

I find Golang's approach to error handling more clear and easy to reason about, which is what this library aims to provide.

## API

In an effort to keep the API concise, `ts-error-tuple` only exports four things:

- `Result` Type
- `attempt` Function
- `fmtError` Function
- `Err` Type

---

### `Result` Type

```ts
type Result<T> = [T, undefined] | [undefined, Error]
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
    return [undefined, fmtError("division by zero")]
  }
  return [a / b, undefined]
}

const [result, err] = divide(10, 0)
if (err) {
  console.error(fmtError("failed to divide", err))
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
const [file, err] = attempt(() => fs.readFileSync("non-existent.json"))
if (err) {
  return [undefined, fmtError("failed to read file", err)]
}
// do something with `file`
```

The function can be either synchronous or asynchronous.

- If the function is async / returns a Promise, the returned `Result` will be a `Promise` and should be `await`ed

```ts
// fs.readFile returns a Promise
const [file, err] = await attempt(() => fs.readFile("file.txt"))
```

In the case where a function doesn't return anything (i.e. `undefined`) but might fail, you can simply ignore the first element of the `Result`.

```ts
const [, err] = attempt(() => fs.rmSync("non-existent.txt"))
if (err) {
  console.error(fmtError("failed to remove file", err))
}
```

---

### `fmtError` Function

```ts
function fmtError(message: string, cause?: unknown): Error
```

`fmtError` takes a message and a cause (optional), and returns a new `Error` with a nicely formatted message.

- All nested errors (i.e. errors attached as `cause`) are unwrapped and included in the final error message
- The error message is formatted as: `message -> cause1 -> cause2 -> ... -> causeN`

```ts
function doTheFirstThing(): Result<string> {
  // throws an error with the message "something went wrong"
}

function doTheSecondThing(): Result<string> {
  const [data, err] = doTheFirstThing()
  if (err) {
    return [undefined, fmtError("failed to do the first thing", err)]
  }
  // do something with `data`...
  return [data, undefined]
}

const [data, err] = doTheSecondThing()
if (err) {
  const error = fmtError("failed to do the second thing", err)
  console.error(error.message)
  // failed to do the second thing -> failed to do the first thing -> something went wrong
}
```

As stated above, the `cause` is optional, because sometimes you need create your own error.

```ts
const [data, err] = getData()
if (err) {
  // handle error
}
if (data.length < 10) {
  const error = fmtError("data is too short")
  return [undefined, error]
}
```

---

### `Err` Type

```ts
type Err = Error | undefined
```

`Err` is a type alias for `Error | undefined` to make function return types more readable.

- This is used for functions that don't return a value but may return an error.

```ts
function validateData(data: string): Err {
  if (data.length < 10) {
    return fmtError("data is too short")
  }
  // implicit return undefined
}

const err = validateData("short")
if (err) {
  console.error(fmtError("failed to validate data", err))
}
```
