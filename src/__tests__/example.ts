import { attempt } from "#attempt.ts"
import { getAllContext, getContext, messageChain } from "#chain.ts"
import { err } from "#err.ts"
import { isErr } from "#result.ts"
import type { Result } from "#result.ts"

// For testing purposes, these functions will do nothing by default and we'll mock them in the test
export const db = {
  connect: (_dbId: string) => {
    void 0
  },
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion - The tests replace `query` with a spy.
  query: ((_queryString: string) => {
    void 0
  }) as unknown as (queryString: string) => Promise<string>,
}

const connectToDb = (dbId: string): Result => {
  const result = attempt(() => {
    db.connect(dbId)
  })
  if (isErr(result)) {
    return err("failed to connect to database", result, {
      timestamp: "<timestamp1>",
      logScope: "connect",
    })
  }
}

const queryDb = async (queryString: string): Promise<Result<string>> => {
  const connectToDbError = connectToDb("db-prod-1")
  if (connectToDbError) return connectToDbError

  const queryResult = await attempt(async () => db.query(queryString))
  if (isErr(queryResult))
    return err("failed to query db", queryResult, { queryString, logScope: "query", timestamp: "<timestamp2>" })

  return queryResult
}

const main = async (): Promise<Result<string>> => {
  const meetingsQueryResult = await queryDb("SELECT * FROM meetings WHERE scheduled_time < actual_end_time")
  if (isErr(meetingsQueryResult)) return err("failed to get meetings", meetingsQueryResult, { logScope: "main" })

  return meetingsQueryResult
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

export const exampleMainWrapper = async () => {
  // wrapped so we can export for use in the tests
  const result = await main()
  if (isErr(result)) {
    const fullContext = {
      logScope: getAllContext<string>(result, "logScope").join("|"),
      timestamp: getContext<string>(result, "timestamp") ?? "",
      queryString: getContext<string>(result, "queryString") ?? "",
    }

    return fakeLogger.error(`something went wrong -> ${messageChain(result)}`, fullContext)
  } // else console.log(result)
  return ""
}
