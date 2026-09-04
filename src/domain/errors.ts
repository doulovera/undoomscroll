import { Data } from "effect"

export class ConfigurationError extends Data.TaggedError("ConfigurationError")<{
  readonly message: string
}> {}

export class UpstreamError extends Data.TaggedError("UpstreamError")<{
  readonly service: "Notion" | "FxTwitter"
  readonly message: string
  readonly status?: number
}> {}

export class DecodeError extends Data.TaggedError("DecodeError")<{
  readonly service: "Notion" | "FxTwitter"
  readonly message: string
}> {}

/** Anything a call to Notion or FxTwitter can fail with. */
export type ExternalServiceError = UpstreamError | DecodeError

export type SyncError = ConfigurationError | ExternalServiceError

export const errorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)
