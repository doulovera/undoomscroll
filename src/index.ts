import "dotenv/config"

import { Effect } from "effect"

import { makeFxTwitterClient } from "./adapters/fxtwitter/client.js"
import { makeNotionClient } from "./adapters/notion/client.js"
import { loadConfig } from "./config.js"
import { startServer } from "./server/http-server.js"

loadConfig.pipe(
  Effect.flatMap((config) =>
    startServer(config, makeNotionClient(config), makeFxTwitterClient(config))
  ),
  Effect.tapError((error) => Effect.logError(error.message)),
  Effect.runPromise
).catch(() => {
  process.exitCode = 1
})
