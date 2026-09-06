import { Effect } from "effect"
import { describe, expect, it } from "vitest"

import { decodeTimeline, toTwitterPost } from "../../../src/adapters/fxtwitter/schema.js"

const basePost = {
  type: "status",
  id: "123",
  url: "https://x.com/example/status/123",
  text: "Hello",
  created_at: "Thu Sep 04 14:00:00 +0000 2026",
  created_timestamp: 1_788_528_000,
  media: {}
}

describe("FxTwitter timeline mapping", () => {
  it.each([
    [{}, "post"],
    [{ replying_to: { status: "122" } }, "reply"],
    [{ quote: { id: "122" } }, "quote"],
    [{ reposted_by: { id: "account" } }, "repost"]
  ] as const)("classifies timeline posts", async (extra, expected) => {
    const timeline = await Effect.runPromise(
      decodeTimeline({ code: 200, results: [{ ...basePost, ...extra }], cursor: { bottom: null } })
    )
    expect(toTwitterPost(timeline.results[0]!)).toMatchObject({ kind: expected })
  })

  it("keeps the post and quoted-post content separate", async () => {
    const timeline = await Effect.runPromise(
      decodeTimeline({
        code: 200,
        results: [
          {
            ...basePost,
            media: {
              all: [{ type: "photo", url: "https://pbs.twimg.com/media/photo.jpg" }]
            },
            quote: {
              text: "Quoted text",
              media: {
                all: [{ type: "video", url: "https://video.twimg.com/video.mp4" }]
              }
            }
          }
        ],
        cursor: { bottom: null }
      })
    )

    expect(toTwitterPost(timeline.results[0]!)).toMatchObject({
      media: [{ type: "image", url: "https://pbs.twimg.com/media/photo.jpg" }],
      quotedPost: {
        text: "Quoted text",
        media: [{ type: "video", url: "https://video.twimg.com/video.mp4" }]
      }
    })
  })

  it("reads the account that performed a repost", async () => {
    const timeline = await Effect.runPromise(
      decodeTimeline({
        code: 200,
        results: [
          {
            ...basePost,
            reposted_by: { screen_name: "effect_ts" }
          }
        ],
        cursor: { bottom: null }
      })
    )

    expect(toTwitterPost(timeline.results[0]!)).toMatchObject({
      kind: "repost",
      repostedBy: "effect_ts"
    })
  })
})
