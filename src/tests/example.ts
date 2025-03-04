import type { Result } from "../index.ts"

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
      timestamp: "<timestamp1>",
      logScope: "connect",
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
    return err("failed to query db", queryResult).ctx({ queryString, logScope: "query", timestamp: "<timestamp2>" })
  }

  return queryResult
}

async function main(): Promise<Result<string>> {
  const meetingsQueryResult = await queryDb("SELECT * FROM meetings WHERE scheduled_time < actual_end_time")
  if (isErr(meetingsQueryResult)) {
    return err("failed to get meetings", meetingsQueryResult).ctx({ logScope: "main" })
  }

  return meetingsQueryResult
}

// eslint-disable-next-line jsdoc/require-jsdoc
async function exampleMainWrapper() {
  // wrapped so we can export for use in the tests
  const result = await main()
  if (isErr(result)) {
    const fullContext = {
      logScope: result.getAll<string>("logScope").join("|"),
      timestamp: result.get<string>("timestamp") ?? "",
      queryString: result.get<string>("queryString") ?? "",
    }

    return fakeLogger.error(result.fmtErr("something went wrong"), fullContext)
  } // else console.log(result)
  return ""
}

interface ErrorContext {
  logScope: string
  timestamp: string
  queryString: string
}

const fakeLogger = {
  error: (message: string, context: ErrorContext) => {
    let { logScope, timestamp, queryString } = context
    logScope = `[${logScope}]`
    timestamp &&= `${timestamp} `
    queryString &&= `: for '${queryString}'`
    const errorMessage = `${timestamp}${logScope} ${message}${queryString}`
    return errorMessage
  },
}

export { exampleMainWrapper, fakeLogger, db }
