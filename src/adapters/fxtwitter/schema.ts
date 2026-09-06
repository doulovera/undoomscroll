import { Effect, Schema } from "effect"

import { DecodeError } from "../../domain/errors.js"
import type { PostKind, PostMedia, QuotedPost, TwitterPost } from "../../domain/post.js"

const MediaItemSchema = Schema.Struct({
  type: Schema.String,
  url: Schema.String
})

const MediaSchema = Schema.Struct({
  all: Schema.optional(Schema.Array(MediaItemSchema))
})

const TimelinePostSchema = Schema.Struct({
  type: Schema.Literal("status"),
  id: Schema.String,
  url: Schema.String,
  text: Schema.String,
  created_at: Schema.String,
  created_timestamp: Schema.Number,
  quote: Schema.optional(Schema.Unknown),
  replying_to: Schema.optional(Schema.Unknown),
  reposted_by: Schema.optional(Schema.Unknown),
  media: Schema.optional(MediaSchema)
})

const TimelineSchema = Schema.Struct({
  code: Schema.Number,
  results: Schema.Array(TimelinePostSchema),
  cursor: Schema.optional(
    Schema.Struct({
      bottom: Schema.NullOr(Schema.String)
    })
  )
})

export type Timeline = typeof TimelineSchema.Type

export const decodeTimeline = (input: unknown): Effect.Effect<Timeline, DecodeError> =>
  Schema.decodeUnknown(TimelineSchema)(input).pipe(
    Effect.mapError(
      (error) =>
        new DecodeError({
          service: "FxTwitter",
          message: `Invalid timeline response: ${error.message}`
        })
    )
  )

export const toTwitterPost = (post: typeof TimelinePostSchema.Type): TwitterPost => {
  const quotedPost = quotedPostFromValue(post.quote)
  const repostedBy = screenNameFromValue(post.reposted_by)

  return {
    id: post.id,
    url: post.url,
    text: post.text,
    createdAt: post.created_at,
    createdTimestamp: post.created_timestamp,
    kind: postKind(post),
    media: mediaFromValue(post.media),
    ...(quotedPost === undefined ? {} : { quotedPost }),
    ...(repostedBy === undefined ? {} : { repostedBy })
  }
}

const postKind = (post: typeof TimelinePostSchema.Type): PostKind => {
  if (post.reposted_by != null) return "repost"
  if (post.quote != null) return "quote"
  if (post.replying_to != null) return "reply"
  return "post"
}

const quotedPostFromValue = (value: unknown): QuotedPost | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const text = Reflect.get(value, "text")
  if (typeof text !== "string") return undefined
  return { text, media: mediaFromQuote(value, 0) }
}

const screenNameFromValue = (value: unknown): string | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const screenName = Reflect.get(value, "screen_name")
  return typeof screenName === "string" && screenName.length > 0 ? screenName : undefined
}

const mediaFromQuote = (value: unknown, depth: number): ReadonlyArray<PostMedia> => {
  if (depth >= 3 || typeof value !== "object" || value === null) return []
  const collected = [
    ...mediaFromValue(Reflect.get(value, "media")),
    ...mediaFromQuote(Reflect.get(value, "quote"), depth + 1)
  ]
  return [...new Map(collected.map((media) => [media.url, media])).values()]
}

const mediaFromValue = (value: unknown): ReadonlyArray<PostMedia> => {
  if (typeof value !== "object" || value === null) return []
  const all = Reflect.get(value, "all")
  if (!Array.isArray(all)) return []

  return all.flatMap((item): ReadonlyArray<PostMedia> => {
    if (typeof item !== "object" || item === null) return []
    const type = Reflect.get(item, "type")
    const url = Reflect.get(item, "url")
    if (typeof type !== "string" || typeof url !== "string") return []
    return [{ type: type === "photo" ? "image" : "video", url }]
  })
}
