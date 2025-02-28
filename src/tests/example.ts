import type { Err, Result } from "../index.ts"

import { attempt, err } from "../index.ts"

// For testing purpose, these functions will do nothing by default and we'll mock them in the test
const db = {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  connect: (_dbId: string) => {
    void 0
  },
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, @typescript-eslint/no-unused-vars
  query: ((_queryString: string) => {
    void 0
  }) as unknown as (queryString: string) => Promise<string>,
}

function connectToDb(dbId: string): Err {
  const [, error] = attempt(() => db.connect(dbId))
  if (error) {
    return err("failed to connect to database", error).ctx({
      timestamp: "2025-02-28T16:51:01.378Z",
      logScope: "db-connect",
    })
  }
  return undefined
}

async function queryDb(queryString: string): Promise<Result<string>> {
  const dbConnectionError = connectToDb("db-prod-1")
  if (dbConnectionError) {
    return [undefined, dbConnectionError]
  }

  // eslint-disable-next-line @typescript-eslint/promise-function-async
  const [data, queryError] = await attempt(() => db.query(queryString))
  if (queryError) {
    return [undefined, err("failed to query db", queryError).ctx({ queryString, logScope: "db-query" })]
  }

  return [data, undefined]
}

// eslint-disable-next-line jsdoc/require-jsdoc
async function example(): Promise<Result<string>> {
  const [meetings, meetingsQueryError] = await queryDb("SELECT * FROM meetings WHERE scheduled_time < actual_end_time")
  if (meetingsQueryError) {
    return [undefined, err("failed to get meetings", meetingsQueryError).ctx({ logScope: "main" })]
  }

  return [meetings, undefined]
}

const fakeLogger = {
  error: (message: string, error: Err) => {
    if (!error) return ""
    const logScope = error.get<string>("logScope") ?? "logScope"
    let timestamp = error.get<string>("timestamp") ?? ""
    timestamp &&= `${timestamp} `
    let queryStringMessage = error.get<string>("queryString") ?? ""
    queryStringMessage &&= `: for '${queryStringMessage}'`
    const errorMessage = `${timestamp}[${logScope}] ${message}${queryStringMessage}`
    return errorMessage
  },
}

export { example, fakeLogger, db }
