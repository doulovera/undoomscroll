import { Config, Effect } from "effect"

import { ConfigurationError } from "./domain/errors.js"

export interface AppConfig {
  readonly notionToken: string
  readonly accountsDataSourceId: string
  readonly postsDataSourceId: string
  readonly notionVersion: string
  readonly fxTwitterBaseUrl: string
  readonly fxTwitterPageSize: number
  readonly fxTwitterMaxPages: number
  readonly rateLimitMs: number
  readonly port: number
}

const config = Config.all({
  notionToken: Config.string("NOTION_TOKEN"),
  accountsDataSourceId: Config.string("NOTION_ACCOUNTS_DATA_SOURCE_ID").pipe(
    Config.withDefault("3d186038-1942-8049-84cc-000bf62ac44c")
  ),
  postsDataSourceId: Config.string("NOTION_POSTS_DATA_SOURCE_ID").pipe(
    Config.withDefault("3d186038-1942-80e7-98ff-000b39e28848")
  ),
  notionVersion: Config.string("NOTION_VERSION").pipe(Config.withDefault("2026-03-11")),
  fxTwitterBaseUrl: Config.string("FXTWITTER_BASE_URL").pipe(
    Config.withDefault("https://api.fxtwitter.com")
  ),
  fxTwitterPageSize: Config.integer("FXTWITTER_PAGE_SIZE").pipe(Config.withDefault(20)),
  fxTwitterMaxPages: Config.integer("FXTWITTER_MAX_PAGES").pipe(Config.withDefault(10)),
  rateLimitMs: Config.integer("RATE_LIMIT_MS").pipe(Config.withDefault(300_000)),
  port: Config.integer("PORT").pipe(Config.withDefault(3000))
})

export const loadConfig: Effect.Effect<AppConfig, ConfigurationError> = config.pipe(
  Effect.mapError((error) => new ConfigurationError({ message: error.message })),
  Effect.flatMap((value) => {
    const problems = [
      value.rateLimitMs < 0 ? "RATE_LIMIT_MS cannot be negative" : undefined,
      value.fxTwitterPageSize < 1 || value.fxTwitterPageSize > 100
        ? "FXTWITTER_PAGE_SIZE must be between 1 and 100"
        : undefined,
      value.fxTwitterMaxPages < 1 ? "FXTWITTER_MAX_PAGES must be at least 1" : undefined,
      value.port < 1 || value.port > 65_535 ? "PORT must be between 1 and 65535" : undefined
    ].filter((problem): problem is string => problem !== undefined)

    return problems.length === 0
      ? Effect.succeed(value)
      : Effect.fail(new ConfigurationError({ message: problems.join("; ") }))
  })
)
