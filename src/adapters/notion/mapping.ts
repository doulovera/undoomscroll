import type { PostMedia, TwitterPost } from "../../domain/post.js"

/** Notion caps title values at 2,000 characters. */
const TITLE_MAX_LENGTH = 2_000

export const notionTitle = (text: string, emptyFallback = "Untitled post"): string => {
  const compact = normalizeText(text)
  if (compact.length === 0) return emptyFallback
  return splitText(compact)[0] ?? emptyFallback
}

export const mapPostProperties = (accountPageId: string, post: TwitterPost) => ({
  title: { title: [{ type: "text", text: { content: postTitle(post) } }] },
  id: { rich_text: [{ type: "text", text: { content: post.id } }] },
  published_at: { date: { start: new Date(post.createdTimestamp * 1000).toISOString() } },
  url: { url: post.url },
  account: { relation: [{ id: accountPageId }] },
  type: { select: { name: post.kind } }
})

export const mapPostBody = (post: TwitterPost): ReadonlyArray<Record<string, unknown>> => {
  const textChunks = splitText(normalizeText(post.text))
  const ownText = post.kind === "repost" ? textChunks : textChunks.slice(1)
  const quotedText = splitText(normalizeText(post.quotedPost?.text ?? ""))

  return [
    ...ownText.map(paragraphBlock),
    ...post.media.map(mediaBlock),
    ...quotedText.map(paragraphBlock),
    ...(post.quotedPost?.media ?? []).map(mediaBlock)
  ]
}

const postTitle = (post: TwitterPost): string => {
  if (post.kind === "repost" && post.repostedBy !== undefined) {
    return `@${post.repostedBy}'s retweeted:`
  }
  const hasImage = post.media.some((media) => media.type === "image")
  return notionTitle(post.text, hasImage ? "📸" : "Untitled post")
}

const normalizeText = (text: string): string => text.replace(/\s+/g, " ").trim()

const splitText = (text: string): ReadonlyArray<string> => {
  const chunks: Array<string> = []
  let current = ""

  for (const character of text) {
    if (current.length + character.length > TITLE_MAX_LENGTH) {
      chunks.push(current)
      current = character
    } else {
      current += character
    }
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

const paragraphBlock = (content: string): Record<string, unknown> => ({
  object: "block",
  type: "paragraph",
  paragraph: {
    rich_text: [{ type: "text", text: { content } }]
  }
})

const mediaBlock = (media: PostMedia): Record<string, unknown> =>
  media.type === "image"
    ? {
        object: "block",
        type: "image",
        image: { type: "external", external: { url: media.url } }
      }
    : {
        object: "block",
        type: "video",
        video: { type: "external", external: { url: media.url } }
      }
