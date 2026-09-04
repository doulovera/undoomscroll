import { Effect } from "effect"

import type { Account } from "../../domain/account.js"
import { normalizeTwitterHandle } from "../../domain/account.js"
import { DecodeError } from "../../domain/errors.js"
import type { StoredPost } from "../../domain/post.js"

export interface NotionPage {
  readonly id: string
  readonly url: string
  readonly properties: Record<string, unknown>
}

export interface QueryResponse {
  readonly results: ReadonlyArray<NotionPage>
  readonly has_more: boolean
  readonly next_cursor: string | null
}

export const decodeQueryResponse = (input: unknown): Effect.Effect<QueryResponse, DecodeError> => {
  if (typeof input !== "object" || input === null) return invalid("Expected an object")
  const results = Reflect.get(input, "results")
  const hasMore = Reflect.get(input, "has_more")
  const nextCursor = Reflect.get(input, "next_cursor")
  if (!Array.isArray(results) || typeof hasMore !== "boolean") return invalid("Invalid query response")

  const pages = results.filter(isNotionPage)
  if (pages.length !== results.length) return invalid("Query returned an invalid page")
  if (nextCursor !== null && typeof nextCursor !== "string") return invalid("Invalid pagination cursor")
  return Effect.succeed({ results: pages, has_more: hasMore, next_cursor: nextCursor })
}

export const decodeAccount = (page: NotionPage): Account | DecodeError => {
  const value = page.properties.handle
  const handle = normalizeTwitterHandle(readRichText(value, "title"))
  return handle.length > 0
    ? { pageId: page.id, pageUrl: page.url, handle }
    : new DecodeError({ service: "Notion", message: `Account ${page.id} has an empty handle` })
}

export const decodeStoredPost = (page: NotionPage): Effect.Effect<StoredPost, DecodeError> => {
  const id = readRichText(page.properties.id, "rich_text")
  const dateProperty = page.properties.published_at
  const date =
    typeof dateProperty === "object" && dateProperty !== null
      ? Reflect.get(dateProperty, "date")
      : undefined
  const start = typeof date === "object" && date !== null ? Reflect.get(date, "start") : undefined

  if (id.length === 0 || typeof start !== "string" || Number.isNaN(Date.parse(start))) {
    return invalid(`Post ${page.id} has an invalid id or published_at`)
  }
  return Effect.succeed({ id, publishedAt: new Date(start) })
}

const isNotionPage = (input: unknown): input is NotionPage =>
  typeof input === "object" &&
  input !== null &&
  typeof Reflect.get(input, "id") === "string" &&
  typeof Reflect.get(input, "url") === "string" &&
  typeof Reflect.get(input, "properties") === "object" &&
  Reflect.get(input, "properties") !== null

const readRichText = (property: unknown, type: "title" | "rich_text"): string => {
  if (typeof property !== "object" || property === null) return ""
  const values = Reflect.get(property, type)
  if (!Array.isArray(values)) return ""
  return values
    .map((value) =>
      typeof value === "object" && value !== null && typeof Reflect.get(value, "plain_text") === "string"
        ? String(Reflect.get(value, "plain_text"))
        : ""
    )
    .join("")
}

const invalid = (message: string): Effect.Effect<never, DecodeError> =>
  Effect.fail(new DecodeError({ service: "Notion", message }))
