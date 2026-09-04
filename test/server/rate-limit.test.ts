import { describe, expect, it } from "vitest"
import { Effect } from "effect"

import {
  claimRateLimit,
  completeRateLimit,
  makeRateLimitState
} from "../../src/server/rate-limit.js"

describe("claimRateLimit", () => {
  it("rejects a second request while the first job is running", async () => {
    const [first, second] = await Effect.runPromise(
      Effect.gen(function* () {
        const ref = yield* makeRateLimitState
        return [yield* claimRateLimit(ref, 300_000), yield* claimRateLimit(ref, 300_000)]
      })
    )

    expect(first).toEqual({ allowed: true, retryAfterMs: 0, reason: "accepted" })
    expect(second).toEqual({ allowed: false, retryAfterMs: 0, reason: "in_progress" })
  })

  it("starts the cooldown when the active job completes", async () => {
    const second = await Effect.runPromise(
      Effect.gen(function* () {
        const ref = yield* makeRateLimitState
        yield* claimRateLimit(ref, 300_000)
        yield* completeRateLimit(ref)
        return yield* claimRateLimit(ref, 300_000)
      })
    )

    expect(second.allowed).toBe(false)
    expect(second.reason).toBe("cooldown")
    expect(second.retryAfterMs).toBeGreaterThan(0)
  })
})
