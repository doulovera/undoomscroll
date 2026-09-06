# undoomscroll

An on-demand Effect service that copies new Twitter/X posts into the `New Posts` Notion database. It reads Twitter accounts from `Accounts to check` and asks FxTwitter for posts from the preceding hour. If an account has a newer stored checkpoint, the client uses that instead.

## Run it

Requires Node.js 24 and pnpm 11.22.0.

```sh
pnpm install --frozen-lockfile
cp .env.example .env
# Edit .env and set NOTION_TOKEN.
pnpm start
```

Share both Notion databases with the integration behind `NOTION_TOKEN`. The integration needs read access to `Accounts to check` and read and insert access to `New Posts`.

Trigger a fetch:

```sh
curl -X POST http://localhost:3000/fetch
```

The server also exposes `GET /health`. It does not schedule work. Only one fetch job can run at a time. After it finishes, the rate-limit cooldown starts; its default is five minutes. Change `RATE_LIMIT_MS` without changing code.

Every external request writes structured `api_call` and `api_result` log lines with the service, operation, method, sanitized path, status, and duration. Query strings are omitted so pagination cursors are not logged. The `/fetch` response and final `api_summary` log include exact Notion, FxTwitter, and total call counts for that run.

## Layout

```
src/
  index.ts                    entrypoint: load config, wire clients, start the server
  config.ts                   environment parsing and validation
  domain/                     types and rules that do not know about any API
  adapters/                   one folder per external service, over a shared fetch helper
    notion/                   client, response decoders, `New Posts` property mapping
    fxtwitter/                client and timeline schema
  sync/                       the sync use case, written against the client interfaces
  server/                     HTTP lifecycle, routes, and the rate-limit guard
```

Dependencies point inward: `server` uses `sync`, `sync` uses the adapter interfaces, and `domain` imports nothing from the layers above it. `test/` mirrors these paths.

## Sync behavior

- Only rows whose `platform` is `twitter` are read from `Accounts to check`.
- `handle` may be a bare username, an `@username`, or an X/Twitter profile URL.
- Each call only considers posts from the preceding hour. The client applies this filter itself because FxTwitter's `since` parameter can return an unfiltered timeline page.
- Existing accounts use their newest related `published_at` when it is newer than the one-hour cutoff.
- Pagination within that window is capped by `FXTWITTER_MAX_PAGES`.
- Replies are not requested. Reposts follow FxTwitter's default timeline behavior.
- Inserts run oldest-first. The post `id` is checked at the checkpoint boundary to avoid duplicates.
- Each fetch job claims tweet IDs in memory across all accounts, so a shared repost is created only once.
- The `type` select stores `post`, `quote`, `reply`, or `repost`.
- Text beyond the 2,000-character title limit continues in the page body.
- Images and videos from the post, including quoted-post media, are added to the page body.

The rate limiter is in memory. Restarting the process clears it, which is appropriate for a basic single-instance guard. Use a shared store if this service later runs with multiple instances.
