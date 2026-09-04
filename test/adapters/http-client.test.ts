import { describe, expect, it } from "vitest"

import { makeApiCallTracker } from "../../src/adapters/http-client.js"

describe("API call tracker", () => {
  it("counts calls by service and in total", () => {
    const tracker = makeApiCallTracker()
    tracker.record("Notion")
    tracker.record("Notion")
    tracker.record("FxTwitter")

    expect(tracker.snapshot()).toEqual({ notion: 2, fxTwitter: 1, total: 3 })
  })
})
