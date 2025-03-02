import type { CtxError, Result } from "../index.ts"

import { attempt, err, isErr } from "../index.ts"

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

function connectToDb(dbId: string): Result {
  const result = attempt(() => db.connect(dbId))
  if (isErr(result)) {
    return err("failed to connect to database", result).ctx({
      timestamp: "2025-02-28T16:51:01.378Z",
      logScope: "db-connect",
    })
  }
}

async function queryDb(queryString: string): Promise<Result<string>> {
  const connectToDbError = connectToDb("db-prod-1")
  if (connectToDbError) {
    return connectToDbError
  }

  // eslint-disable-next-line @typescript-eslint/promise-function-async
  const queryResult = await attempt(() => db.query(queryString))
  if (isErr(queryResult)) {
    return err("failed to query db", queryResult).ctx({ queryString, logScope: "db-query" })
  }

  return queryResult
}

// eslint-disable-next-line jsdoc/require-jsdoc
async function example(): Promise<Result<string>> {
  const meetingsQueryResult = await queryDb("SELECT * FROM meetings WHERE scheduled_time < actual_end_time")
  if (isErr(meetingsQueryResult)) {
    return err("failed to get meetings", meetingsQueryResult).ctx({ logScope: "main" })
  }

  return meetingsQueryResult
}

const fakeLogger = {
  error: (message: string, error: CtxError) => {
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
