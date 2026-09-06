import { Effect, Either } from "effect"

import type { FxTwitterClient } from "../adapters/fxtwitter/client.js"
import type { ApiCallTracker } from "../adapters/http-client.js"
import type { NotionClient } from "../adapters/notion/client.js"
import type { ExternalServiceError } from "../domain/errors.js"
import { errorMessage } from "../domain/errors.js"
import type { TwitterPost } from "../domain/post.js"

/** How many accounts are synced at the same time. */
const ACCOUNT_CONCURRENCY = 3

export interface AccountSyncResult {
  readonly account: string
  readonly ok: boolean
  readonly fetched: number
  readonly created: number
  readonly error?: string
}

export interface SyncSummary {
  readonly fetchedAccounts: number
  readonly createdPosts: number
  readonly accounts: ReadonlyArray<AccountSyncResult>
}

export const syncTwitter = (
  notion: NotionClient,
  fxTwitter: FxTwitterClient,
  tracker: ApiCallTracker
): Effect.Effect<SyncSummary, ExternalServiceError> =>
  Effect.suspend(() => {
    const claimedPostIds = new Set<string>()

    return notion.listTwitterAccounts(tracker).pipe(
      Effect.flatMap((accounts) =>
        Effect.forEach(
          accounts,
          (account) =>
            syncAccount(
              notion,
              fxTwitter,
              tracker,
              claimedPostIds,
              account.pageId,
              account.handle
            ).pipe(
              Effect.either,
              Effect.map((outcome) => ({ handle: account.handle, outcome }))
            ),
          { concurrency: ACCOUNT_CONCURRENCY }
        )
      ),
      Effect.map((outcomes) => {
        const accounts = outcomes.map(({ handle, outcome }) =>
          Either.isRight(outcome)
            ? outcome.right
            : ({
                account: handle,
                ok: false,
                fetched: 0,
                created: 0,
                error: errorMessage(outcome.left)
              } satisfies AccountSyncResult)
        )
        return {
          fetchedAccounts: accounts.length,
          createdPosts: accounts.reduce((sum, account) => sum + account.created, 0),
          accounts
        }
      })
    )
  })

const syncAccount = (
  notion: NotionClient,
  fxTwitter: FxTwitterClient,
  tracker: ApiCallTracker,
  claimedPostIds: Set<string>,
  accountPageId: string,
  handle: string
): Effect.Effect<AccountSyncResult, ExternalServiceError> =>
  Effect.gen(function* () {
    const latest = yield* notion.latestPost(accountPageId, tracker)
    const posts = yield* fxTwitter.postsSince(handle, latest, tracker)
    const ordered = [...posts].sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    let created = 0

    for (const post of ordered) {
      if (claimedPostIds.has(post.id)) continue
      claimedPostIds.add(post.id)

      if (yield* shouldCreate(notion, tracker, latest?.id, latest?.publishedAt.getTime(), post)) {
        yield* notion.createPost(accountPageId, post, tracker)
        created += 1
      }
    }

    return { account: handle, ok: true, fetched: posts.length, created }
  })

const shouldCreate = (
  notion: NotionClient,
  tracker: ApiCallTracker,
  latestId: string | undefined,
  latestTimeMs: number | undefined,
  post: TwitterPost
): Effect.Effect<boolean, ExternalServiceError> => {
  if (post.id === latestId) return Effect.succeed(false)
  if (latestTimeMs === undefined) {
    return notion.postExists(post.id, tracker).pipe(Effect.map((exists) => !exists))
  }
  const postTimeMs = post.createdTimestamp * 1000
  if (postTimeMs > latestTimeMs) return Effect.succeed(true)
  if (postTimeMs < latestTimeMs) return Effect.succeed(false)
  return notion.postExists(post.id, tracker).pipe(Effect.map((exists) => !exists))
}
