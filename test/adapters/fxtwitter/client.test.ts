import { Effect } from "effect"
import { afterEach, describe, expect, it, vi } from "vitest"

import { makeFxTwitterClient } from "../../../src/adapters/fxtwitter/client.js"
import { makeApiCallTracker } from "../../../src/adapters/http-client.js"
import type { AppConfig } from "../../../src/config.js"

const config: AppConfig = {
  notionToken: "test",
  accountsDataSourceId: "accounts",
  postsDataSourceId: "posts",
  notionVersion: "2026-03-11",
  fxTwitterBaseUrl: "https://api.fxtwitter.test",
  fxTwitterPageSize: 20,
  fxTwitterMaxPages: 10,
  rateLimitMs: 300_000,
  port: 3000
}

const status = (id: string, createdTimestamp: number) => ({
  type: "status",
  id,
  url: `https://x.com/example/status/${id}`,
  text: id,
  created_at: new Date(createdTimestamp * 1000).toUTCString(),
  created_timestamp: createdTimestamp,
  media: {}
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe("FxTwitter client", () => {
  it("filters old posts when FxTwitter returns them despite the since parameter", async () => {
    vi.useFakeTimers()
    const calledAt = new Date("2026-09-06T12:00:00.000Z")
    vi.setSystemTime(calledAt)
    const hourAgoSeconds = calledAt.getTime() / 1000 - 60 * 60
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      Response.json({
        code: 200,
        results: [status("recent", hourAgoSeconds + 60), status("old", hourAgoSeconds - 60)],
        cursor: { bottom: "unused-because-cutoff-was-crossed" }
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const posts = await Effect.runPromise(
      makeFxTwitterClient(config).postsSince(
        "example",
        { id: "much-older", publishedAt: new Date(calledAt.getTime() - 3 * 60 * 60 * 1000) },
        makeApiCallTracker()
      )
    )

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(requestedUrl.searchParams.get("since")).toBe(String(hourAgoSeconds - 1))
    expect(posts.map((post) => post.id)).toEqual(["recent"])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("keeps a newer stored post as the cutoff", async () => {
    vi.useFakeTimers()
    const calledAt = new Date("2026-09-06T12:00:00.000Z")
    vi.setSystemTime(calledAt)
    const latestSeconds = calledAt.getTime() / 1000 - 10 * 60
    const fetchMock = vi.fn(async (_input: string | URL | Request) =>
      new Response(null, { status: 204 })
    )
    vi.stubGlobal("fetch", fetchMock)

    await Effect.runPromise(
      makeFxTwitterClient(config).postsSince(
        "example",
        { id: "latest", publishedAt: new Date(latestSeconds * 1000) },
        makeApiCallTracker()
      )
    )

    const requestedUrl = new URL(String(fetchMock.mock.calls[0]![0]))
    expect(requestedUrl.searchParams.get("since")).toBe(String(latestSeconds - 1))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
