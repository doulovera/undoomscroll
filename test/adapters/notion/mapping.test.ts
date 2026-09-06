import { describe, expect, it } from "vitest"

import {
  mapPostBody,
  mapPostProperties,
  notionTitle
} from "../../../src/adapters/notion/mapping.js"
import type { TwitterPost } from "../../../src/domain/post.js"

describe("mapPostProperties", () => {
  it("maps the FxTwitter post to the New Posts schema", () => {
    const post: TwitterPost = {
      id: "123",
      url: "https://x.com/effect_ts/status/123",
      text: "An Effect post",
      createdAt: "Thu Sep 04 14:00:00 +0000 2026",
      createdTimestamp: 1_788_528_000,
      kind: "post",
      media: []
    }

    expect(mapPostProperties("account-page-id", post)).toEqual({
      title: { title: [{ type: "text", text: { content: "An Effect post" } }] },
      id: { rich_text: [{ type: "text", text: { content: "123" } }] },
      published_at: { date: { start: "2026-09-04T13:20:00.000Z" } },
      url: { url: "https://x.com/effect_ts/status/123" },
      account: { relation: [{ id: "account-page-id" }] },
      type: { select: { name: "post" } }
    })
  })

  it("caps Notion titles at 2,000 characters", () => {
    expect(notionTitle("x".repeat(2_100))).toHaveLength(2_000)
  })

  it("uses a camera title for image-only posts", () => {
    const post: TwitterPost = {
      id: "image-only",
      url: "https://x.com/effect_ts/status/image-only",
      text: "",
      createdAt: "Thu Sep 04 14:00:00 +0000 2026",
      createdTimestamp: 1_788_528_000,
      kind: "post",
      media: [{ type: "image", url: "https://pbs.twimg.com/media/photo.jpg" }]
    }

    expect(mapPostProperties("account-page-id", post).title).toEqual({
      title: [{ type: "text", text: { content: "📸" } }]
    })
  })

  it("uses the reposter handle as the title and puts the post in the body", () => {
    const post: TwitterPost = {
      id: "repost",
      url: "https://x.com/original/status/repost",
      text: "Original post text",
      createdAt: "Thu Sep 04 14:00:00 +0000 2026",
      createdTimestamp: 1_788_528_000,
      kind: "repost",
      media: [],
      repostedBy: "effect_ts"
    }

    expect(mapPostProperties("account-page-id", post).title).toEqual({
      title: [{ type: "text", text: { content: "@effect_ts's retweeted:" } }]
    })
    expect(mapPostBody(post)).toEqual([
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: "Original post text" } }]
        }
      }
    ])
  })

  it("puts title overflow and media in page blocks", () => {
    const post: TwitterPost = {
      id: "123",
      url: "https://x.com/effect_ts/status/123",
      text: "x".repeat(2_100),
      createdAt: "Thu Sep 04 14:00:00 +0000 2026",
      createdTimestamp: 1_788_528_000,
      kind: "quote",
      media: [{ type: "image", url: "https://pbs.twimg.com/media/photo.jpg" }],
      quotedPost: {
        text: "Quoted post text",
        media: [{ type: "video", url: "https://video.twimg.com/video.mp4" }]
      }
    }

    expect(mapPostBody(post)).toEqual([
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: "x".repeat(100) } }]
        }
      },
      {
        object: "block",
        type: "image",
        image: { type: "external", external: { url: "https://pbs.twimg.com/media/photo.jpg" } }
      },
      {
        object: "block",
        type: "paragraph",
        paragraph: {
          rich_text: [{ type: "text", text: { content: "Quoted post text" } }]
        }
      },
      {
        object: "block",
        type: "video",
        video: { type: "external", external: { url: "https://video.twimg.com/video.mp4" } }
      }
    ])
  })
})
