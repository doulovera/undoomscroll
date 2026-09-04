import { Clock, Effect, Ref } from "effect"

export interface RateLimitClaim {
  readonly allowed: boolean
  readonly retryAfterMs: number
  readonly reason: "accepted" | "in_progress" | "cooldown"
}

interface RateLimitValue {
  readonly inProgress: boolean
  readonly lastCompletedAt: number | undefined
}

/** In-memory single-instance guard plus a cooldown measured from job completion. */
export type RateLimitState = Ref.Ref<RateLimitValue>

export const makeRateLimitState: Effect.Effect<RateLimitState> = Ref.make<RateLimitValue>({
  inProgress: false,
  lastCompletedAt: undefined
})

export const claimRateLimit = (
  ref: RateLimitState,
  windowMs: number
): Effect.Effect<RateLimitClaim> =>
  Clock.currentTimeMillis.pipe(
    Effect.flatMap((now) =>
      Ref.modify<RateLimitValue, RateLimitClaim>(ref, (state) => {
        if (state.inProgress) {
          return [
            { allowed: false, retryAfterMs: 0, reason: "in_progress" },
            state
          ]
        }

        const elapsed =
          state.lastCompletedAt === undefined
            ? Number.POSITIVE_INFINITY
            : now - state.lastCompletedAt
        if (elapsed < windowMs) {
          return [
            { allowed: false, retryAfterMs: windowMs - elapsed, reason: "cooldown" },
            state
          ]
        }

        return [
          { allowed: true, retryAfterMs: 0, reason: "accepted" },
          { ...state, inProgress: true }
        ]
      })
    )
  )

export const completeRateLimit = (ref: RateLimitState): Effect.Effect<void> =>
  Clock.currentTimeMillis.pipe(
    Effect.flatMap((now) =>
      Ref.set(ref, {
        inProgress: false,
        lastCompletedAt: now
      })
    )
  )
