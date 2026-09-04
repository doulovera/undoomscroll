import { Clock, Effect } from "effect"

import { DecodeError, UpstreamError, errorMessage } from "../domain/errors.js"
import type { ExternalServiceError } from "../domain/errors.js"

export type ExternalService = "Notion" | "FxTwitter"

export interface ApiCallCounts {
  readonly notion: number
  readonly fxTwitter: number
  readonly total: number
}

export interface ApiCallTracker {
  readonly record: (service: ExternalService) => void
  readonly snapshot: () => ApiCallCounts
}

export const makeApiCallTracker = (): ApiCallTracker => {
  let notion = 0
  let fxTwitter = 0

  return {
    record: (service) => {
      if (service === "Notion") notion += 1
      else fxTwitter += 1
    },
    snapshot: () => ({ notion, fxTwitter, total: notion + fxTwitter })
  }
}

export interface JsonResponse {
  readonly status: number
  readonly body: unknown
}

export const fetchJson = (
  service: ExternalService,
  operation: string,
  url: string,
  init: RequestInit | undefined,
  tracker: ApiCallTracker
): Effect.Effect<JsonResponse, ExternalServiceError> =>
  Effect.gen(function* () {
    const method = init?.method ?? "GET"
    const path = safePath(url)
    yield* Effect.sync(() => tracker.record(service))
    const startedAt = yield* Clock.currentTimeMillis
    yield* Effect.logInfo(
      `api_call service=${service} operation=${operation} method=${method} path=${path}`
    )

    return yield* executeRequest(service, url, init).pipe(
      Effect.matchEffect({
        onFailure: (error) =>
          Clock.currentTimeMillis.pipe(
            Effect.tap((finishedAt) =>
              Effect.logWarning(
                `api_result service=${service} operation=${operation} outcome=failed duration_ms=${finishedAt - startedAt}`
              )
            ),
            Effect.flatMap(() => Effect.fail(error))
          ),
        onSuccess: (result) =>
          Clock.currentTimeMillis.pipe(
            Effect.tap((finishedAt) =>
              Effect.logInfo(
                `api_result service=${service} operation=${operation} outcome=success status=${result.status} duration_ms=${finishedAt - startedAt}`
              )
            ),
            Effect.as(result)
          )
      })
    )
  })

const executeRequest = (
  service: ExternalService,
  url: string,
  init?: RequestInit
): Effect.Effect<JsonResponse, ExternalServiceError> =>
  Effect.tryPromise({
    try: () => fetch(url, init),
    catch: (error) => new UpstreamError({ service, message: errorMessage(error) })
  }).pipe(
    Effect.flatMap((response) => {
      if (response.status === 204) {
        return Effect.succeed({ status: response.status, body: null })
      }

      return Effect.tryPromise({
        try: () => response.json() as Promise<unknown>,
        catch: (error) =>
          new DecodeError({
            service,
            message: `Could not decode the ${response.status} response: ${errorMessage(error)}`
          })
      }).pipe(
        Effect.flatMap((body) =>
          response.ok
            ? Effect.succeed({ status: response.status, body })
            : Effect.fail(
                new UpstreamError({
                  service,
                  status: response.status,
                  message: readApiMessage(body) ?? `${service} returned HTTP ${response.status}`
                })
              )
        )
      )
    })
  )

const safePath = (url: string): string => {
  try {
    return new URL(url).pathname
  } catch {
    return "invalid-url"
  }
}

const readApiMessage = (body: unknown): string | undefined => {
  if (typeof body !== "object" || body === null) return undefined
  const message = Reflect.get(body, "message")
  const error = Reflect.get(body, "error")
  return typeof message === "string" ? message : typeof error === "string" ? error : undefined
}
