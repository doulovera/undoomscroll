import { createServer } from "node:http"

import { Effect, Runtime } from "effect"

import type { FxTwitterClient } from "../adapters/fxtwitter/client.js"
import type { NotionClient } from "../adapters/notion/client.js"
import type { AppConfig } from "../config.js"
import { makeRateLimitState } from "./rate-limit.js"
import { handleRequest } from "./routes.js"

export const startServer = (
  config: AppConfig,
  notion: NotionClient,
  fxTwitter: FxTwitterClient
): Effect.Effect<never, never> =>
  Effect.gen(function* () {
    const rateLimit = yield* makeRateLimitState
    const runtime = yield* Effect.runtime<never>()
    const deps = { notion, fxTwitter, rateLimit, rateLimitMs: config.rateLimitMs }

    const server = createServer((request, response) => {
      Runtime.runFork(runtime)(handleRequest(deps, request, response))
    })

    yield* Effect.async<void, never>((resume) => {
      server.listen(config.port, () => {
        console.log(`undoomscroll listening on http://localhost:${config.port}`)
      })
      server.once("error", (error) => {
        console.error(error)
        resume(Effect.die(error))
      })
      return Effect.sync(() => server.close())
    })

    return yield* Effect.never
  })
