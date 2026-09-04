import { Effect } from "effect"

import type { AppConfig } from "../../config.js"
import { UpstreamError } from "../../domain/errors.js"
import type { ExternalServiceError } from "../../domain/errors.js"
import type { StoredPost, TwitterPost } from "../../domain/post.js"
import { fetchJson } from "../http-client.js"
import type { ApiCallTracker } from "../http-client.js"
import type { Timeline } from "./schema.js"
import { decodeTimeline, toTwitterPost } from "./schema.js"

export interface FxTwitterClient {
  /** Posts published at or after `latest`, walking back one page at a time. */
  readonly postsSince: (
    handle: string,
    latest: StoredPost | undefined,
    tracker: ApiCallTracker
  ) => Effect.Effect<ReadonlyArray<TwitterPost>, ExternalServiceError>
}

export const makeFxTwitterClient = (config: AppConfig): FxTwitterClient => {
  const getPage = (
    handle: string,
    since: number | undefined,
    cursor: string | undefined,
    tracker: ApiCallTracker
  ): Effect.Effect<Timeline | undefined, ExternalServiceError> => {
    const url = new URL(
      `/2/profile/${encodeURIComponent(handle)}/statuses`,
      config.fxTwitterBaseUrl
    )
    url.searchParams.set("count", String(config.fxTwitterPageSize))
    if (since !== undefined && cursor === undefined) url.searchParams.set("since", String(since))
    if (cursor !== undefined) url.searchParams.set("cursor", cursor)

    return fetchJson("FxTwitter", "list_statuses", url.toString(), undefined, tracker).pipe(
      Effect.flatMap(({ status, body }) => {
        if (status === 204) return Effect.succeed(undefined)
        return decodeTimeline(body).pipe(
          Effect.flatMap((timeline) =>
            timeline.code === 200
              ? Effect.succeed(timeline)
              : Effect.fail(
                  new UpstreamError({
                    service: "FxTwitter",
                    status: timeline.code,
                    message: `FxTwitter returned API code ${timeline.code} for @${handle}`
                  })
                )
          )
        )
      })
    )
  }

  const postsSince = (
    handle: string,
    latest: StoredPost | undefined,
    tracker: ApiCallTracker
  ): Effect.Effect<ReadonlyArray<TwitterPost>, ExternalServiceError> => {
    const cutoffSeconds = latest === undefined ? undefined : latest.publishedAt.getTime() / 1000
    const since = cutoffSeconds === undefined ? undefined : Math.floor(cutoffSeconds) - 1

    const loop = (
      cursor: string | undefined,
      pageNumber: number,
      collected: ReadonlyArray<TwitterPost>
    ): Effect.Effect<ReadonlyArray<TwitterPost>, ExternalServiceError> =>
      getPage(handle, since, cursor, tracker).pipe(
        Effect.flatMap((page) => {
          if (page === undefined) return Effect.succeed(collected)
          const posts = page.results.map(toTwitterPost)
          const fresh =
            cutoffSeconds === undefined
              ? posts
              : posts.filter((post) => post.createdTimestamp >= cutoffSeconds)
          const all = [...collected, ...fresh]
          const crossedCheckpoint =
            cutoffSeconds !== undefined && posts.some((post) => post.createdTimestamp < cutoffSeconds)
          const nextCursor = page.cursor?.bottom ?? undefined

          if (
            cutoffSeconds === undefined ||
            crossedCheckpoint ||
            nextCursor === undefined ||
            pageNumber >= config.fxTwitterMaxPages
          ) {
            return Effect.succeed(dedupe(all))
          }
          return loop(nextCursor, pageNumber + 1, all)
        })
      )

    return loop(undefined, 1, [])
  }

  return { postsSince }
}

const dedupe = (posts: ReadonlyArray<TwitterPost>): ReadonlyArray<TwitterPost> => [
  ...new Map(posts.map((post) => [post.id, post])).values()
]
