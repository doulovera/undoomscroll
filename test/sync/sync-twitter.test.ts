import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import type { FxTwitterClient } from "../../src/adapters/fxtwitter/client.js"
import { makeApiCallTracker } from "../../src/adapters/http-client.js"
import type { NotionClient } from "../../src/adapters/notion/client.js"
import type { TwitterPost } from "../../src/domain/post.js"
import { syncTwitter } from "../../src/sync/sync-twitter.js"

const sharedPost: TwitterPost = {
  id: "shared-post",
  url: "https://x.com/original/status/shared-post",
  text: "Shared post",
  createdAt: "Thu Sep 04 14:00:00 +0000 2026",
  createdTimestamp: 1_788_528_000,
  kind: "repost",
  media: []
}

describe("syncTwitter", () => {
  it("creates a post only once when multiple accounts return the same ID", async () => {
    const created: Array<string> = []
    let existenceChecks = 0
    const notion: NotionClient = {
      listTwitterAccounts: () =>
        Effect.succeed([
          { pageId: "account-1", pageUrl: "https://notion.so/account-1", handle: "one" },
          { pageId: "account-2", pageUrl: "https://notion.so/account-2", handle: "two" }
        ]),
      latestPost: () => Effect.succeed(undefined),
      postExists: () => {
        existenceChecks += 1
        return Effect.succeed(false)
      },
      createPost: (_accountId, post) => Effect.sync(() => created.push(post.id))
    }
    const fxTwitter: FxTwitterClient = {
      postsSince: () => Effect.succeed([sharedPost])
    }

    await Effect.runPromise(syncTwitter(notion, fxTwitter, makeApiCallTracker()))

    expect(created).toEqual(["shared-post"])
    expect(existenceChecks).toBe(1)
  })

  it("skips the latest stored ID when Notion rounded its timestamp down", async () => {
    const created: Array<string> = []
    let existenceChecks = 0
    const notion: NotionClient = {
      listTwitterAccounts: () =>
        Effect.succeed([
          { pageId: "account-1", pageUrl: "https://notion.so/account-1", handle: "one" }
        ]),
      latestPost: () =>
        Effect.succeed({
          id: sharedPost.id,
          publishedAt: new Date(sharedPost.createdTimestamp * 1000 - 5_000)
        }),
      postExists: () => {
        existenceChecks += 1
        return Effect.succeed(false)
      },
      createPost: (_accountId, post) => Effect.sync(() => created.push(post.id))
    }
    const fxTwitter: FxTwitterClient = {
      postsSince: () => Effect.succeed([sharedPost])
    }

    const summary = await Effect.runPromise(
      syncTwitter(notion, fxTwitter, makeApiCallTracker())
    )

    expect(summary.createdPosts).toBe(0)
    expect(created).toEqual([])
    expect(existenceChecks).toBe(0)
  })
})
