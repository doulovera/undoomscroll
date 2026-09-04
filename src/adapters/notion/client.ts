import { Effect } from "effect"

import type { AppConfig } from "../../config.js"
import type { Account } from "../../domain/account.js"
import { DecodeError } from "../../domain/errors.js"
import type { ExternalServiceError } from "../../domain/errors.js"
import type { StoredPost, TwitterPost } from "../../domain/post.js"
import { fetchJson } from "../http-client.js"
import type { ApiCallTracker } from "../http-client.js"
import type { QueryResponse } from "./decode.js"
import { decodeAccount, decodeQueryResponse, decodeStoredPost } from "./decode.js"
import { mapPostBody, mapPostProperties } from "./mapping.js"

const API_BASE_URL = "https://api.notion.com/v1"

export interface NotionClient {
  readonly listTwitterAccounts: (
    tracker: ApiCallTracker
  ) => Effect.Effect<ReadonlyArray<Account>, ExternalServiceError>
  readonly latestPost: (
    accountPageId: string,
    tracker: ApiCallTracker
  ) => Effect.Effect<StoredPost | undefined, ExternalServiceError>
  readonly postExists: (
    postId: string,
    tracker: ApiCallTracker
  ) => Effect.Effect<boolean, ExternalServiceError>
  readonly createPost: (
    accountPageId: string,
    post: TwitterPost,
    tracker: ApiCallTracker
  ) => Effect.Effect<void, ExternalServiceError>
}

export const makeNotionClient = (config: AppConfig): NotionClient => {
  const headers = {
    Authorization: `Bearer ${config.notionToken}`,
    "Content-Type": "application/json",
    "Notion-Version": config.notionVersion
  }

  const query = (
    operation: string,
    dataSourceId: string,
    body: Record<string, unknown>,
    tracker: ApiCallTracker
  ): Effect.Effect<QueryResponse, ExternalServiceError> =>
    fetchJson(
      "Notion",
      operation,
      `${API_BASE_URL}/data_sources/${dataSourceId}/query`,
      { method: "POST", headers, body: JSON.stringify(body) },
      tracker
    ).pipe(Effect.flatMap(({ body: responseBody }) => decodeQueryResponse(responseBody)))

  const listTwitterAccounts = (
    tracker: ApiCallTracker
  ): Effect.Effect<ReadonlyArray<Account>, ExternalServiceError> => {
    const loop = (
      cursor: string | undefined,
      collected: ReadonlyArray<Account>
    ): Effect.Effect<ReadonlyArray<Account>, ExternalServiceError> =>
      query(
        "list_twitter_accounts",
        config.accountsDataSourceId,
        {
          page_size: 100,
          filter: { property: "platform", select: { equals: "twitter" } },
          ...(cursor === undefined ? {} : { start_cursor: cursor })
        },
        tracker
      ).pipe(
        Effect.flatMap((page) => {
          const accounts = page.results.map(decodeAccount)
          const invalid = accounts.find((account) => account instanceof DecodeError)
          if (invalid instanceof DecodeError) return Effect.fail(invalid)

          const next = [...collected, ...(accounts as ReadonlyArray<Account>)]
          return page.has_more && page.next_cursor !== null
            ? loop(page.next_cursor, next)
            : Effect.succeed(next)
        })
      )

    return loop(undefined, [])
  }

  const latestPost = (
    accountPageId: string,
    tracker: ApiCallTracker
  ): Effect.Effect<StoredPost | undefined, ExternalServiceError> =>
    query(
      "find_latest_post",
      config.postsDataSourceId,
      {
        page_size: 1,
        filter: { property: "account", relation: { contains: accountPageId } },
        sorts: [{ property: "published_at", direction: "descending" }]
      },
      tracker
    ).pipe(
      Effect.flatMap((page) => {
        const first = page.results[0]
        if (first === undefined) return Effect.succeed(undefined)
        return decodeStoredPost(first)
      })
    )

  const postExists = (
    postId: string,
    tracker: ApiCallTracker
  ): Effect.Effect<boolean, ExternalServiceError> =>
    query(
      "check_post_exists",
      config.postsDataSourceId,
      { page_size: 1, filter: { property: "id", rich_text: { equals: postId } } },
      tracker
    ).pipe(Effect.map((page) => page.results.length > 0))

  const createPost = (
    accountPageId: string,
    post: TwitterPost,
    tracker: ApiCallTracker
  ): Effect.Effect<void, ExternalServiceError> => {
    const children = mapPostBody(post)
    return fetchJson(
      "Notion",
      "create_post",
      `${API_BASE_URL}/pages`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          parent: { type: "data_source_id", data_source_id: config.postsDataSourceId },
          properties: mapPostProperties(accountPageId, post),
          ...(children.length === 0 ? {} : { children })
        })
      },
      tracker
    ).pipe(Effect.asVoid)
  }

  return { listTwitterAccounts, latestPost, postExists, createPost }
}
