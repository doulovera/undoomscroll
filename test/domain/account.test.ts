import { describe, expect, it } from "vitest"

import { normalizeTwitterHandle } from "../../src/domain/account.js"

describe("normalizeTwitterHandle", () => {
  it.each([
    ["@effect_ts", "effect_ts"],
    ["effect_ts", "effect_ts"],
    ["https://x.com/effect_ts", "effect_ts"],
    ["https://twitter.com/effect_ts/status/1", "effect_ts"]
  ])("normalizes %s", (input, expected) => {
    expect(normalizeTwitterHandle(input)).toBe(expected)
  })
})
