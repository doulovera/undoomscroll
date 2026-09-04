import type { PostMedia, TwitterPost } from "../../domain/post.js"

/** Notion caps title values at 2,000 characters. */
const TITLE_MAX_LENGTH = 2_000

export const notionTitle = (text: string): string => {
  const compact = normalizeText(text)
  if (compact.length === 0) return "Untitled post"
  return splitText(compact)[0] ?? "Untitled post"
}

export const mapPostProperties = (accountPageId: string, post: TwitterPost) => ({
  title: { title: [{ type: "text", text: { content: notionTitle(post.text) } }] },
  id: { rich_text: [{ type: "text", text: { content: post.id } }] },
  published_at: { date: { start: new Date(post.createdTimestamp * 1000).toISOString() } },
  url: { url: post.url },
  account: { relation: [{ id: accountPageId }] },
  type: { select: { name: post.kind } }
})

export const mapPostBody = (post: TwitterPost): ReadonlyArray<Record<string, unknown>> => {
  const [, ...overflow] = splitText(normalizeText(post.text))
  return [...overflow.map(paragraphBlock), ...post.media.map(mediaBlock)]
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
