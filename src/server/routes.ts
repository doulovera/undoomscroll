import type { IncomingMessage, ServerResponse } from "node:http"

import { Effect } from "effect"

import type { FxTwitterClient } from "../adapters/fxtwitter/client.js"
import { makeApiCallTracker } from "../adapters/http-client.js"
import type { ApiCallCounts } from "../adapters/http-client.js"
import type { NotionClient } from "../adapters/notion/client.js"
import { errorMessage } from "../domain/errors.js"
import { syncTwitter } from "../sync/sync-twitter.js"
import type { RateLimitState } from "./rate-limit.js"
import { claimRateLimit, completeRateLimit } from "./rate-limit.js"

export interface RouteDeps {
  readonly notion: NotionClient
  readonly fxTwitter: FxTwitterClient
  readonly rateLimit: RateLimitState
  readonly rateLimitMs: number
}

export const handleRequest = (
  deps: RouteDeps,
  request: IncomingMessage,
  response: ServerResponse
): Effect.Effect<void> => {
  const path = new URL(request.url ?? "/", "http://localhost").pathname

  if (request.method === "GET" && path === "/health") {
    return Effect.sync(() => sendJson(response, 200, { ok: true }))
  }
  if (request.method !== "POST" || path !== "/fetch") {
    return Effect.sync(() => sendJson(response, 404, { error: "Not found" }))
  }

  return fetchRoute(deps, response).pipe(
    Effect.catchAllCause((cause) =>
      Effect.sync(() => sendJson(response, 500, { error: String(cause) }))
    )
  )
}

const fetchRoute = (deps: RouteDeps, response: ServerResponse): Effect.Effect<void> =>
  claimRateLimit(deps.rateLimit, deps.rateLimitMs).pipe(
    Effect.flatMap((claim) => {
      if (!claim.allowed) {
        if (claim.reason === "cooldown") {
          response.setHeader("Retry-After", String(Math.ceil(claim.retryAfterMs / 1000)))
        }
        return Effect.sync(() =>
          sendJson(response, claim.reason === "in_progress" ? 409 : 429, {
            error: claim.reason === "in_progress" ? "Fetch already in progress" : "Rate limit exceeded",
            retryAfterMs: claim.retryAfterMs,
            apiCalls: { notion: 0, fxTwitter: 0, total: 0 }
          })
        )
      }

      const tracker = makeApiCallTracker()
      return syncTwitter(deps.notion, deps.fxTwitter, tracker).pipe(
        Effect.matchEffect({
          onFailure: (error) => {
            const apiCalls = tracker.snapshot()
            return Effect.logWarning(callSummary(apiCalls)).pipe(
              Effect.zipRight(
                Effect.sync(() =>
                  sendJson(response, 502, { error: errorMessage(error), apiCalls })
                )
              )
            )
          },
          onSuccess: (summary) => {
            const apiCalls = tracker.snapshot()
            return Effect.logInfo(
              `Created ${summary.createdPosts} Twitter posts; ${callSummary(apiCalls)}`
            ).pipe(
              Effect.zipRight(Effect.sync(() => sendJson(response, 200, { ...summary, apiCalls })))
            )
          }
        }),
        Effect.ensuring(completeRateLimit(deps.rateLimit))
      )
    })
  )

export const sendJson = (response: ServerResponse, status: number, body: unknown): void => {
  if (response.headersSent) return
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" })
  response.end(JSON.stringify(body))
}

const callSummary = (counts: ApiCallCounts): string =>
  `api_summary total=${counts.total} notion=${counts.notion} fx_twitter=${counts.fxTwitter}`
