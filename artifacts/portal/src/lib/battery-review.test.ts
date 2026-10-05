import { describe, expect, it } from "vitest";
import { hasBatteryReviewFlags, reviewSaveSummary, reviewFlagAfterWeightCorrection, TOKEN_WEIGHT_FLAG_REASON } from "./battery-review";

const clean = {
  serialFlagReason: null, manufacturerFlagReason: null,
  cellModelFlagReason: null, voltageFlagReason: null,
};

describe("draft token-weight warning", () => {
  it("removes a stale token flag when an automatic calculation replaces the weight", () => {
    expect(reviewFlagAfterWeightCorrection(TOKEN_WEIGHT_FLAG_REASON, "552.720")).toBe("");
  });
  it.each(["", "0", "-1", "500kg"])("keeps the flag for an invalid replacement (%s)", (weight) => {
    expect(reviewFlagAfterWeightCorrection(TOKEN_WEIGHT_FLAG_REASON, weight)).toBe(TOKEN_WEIGHT_FLAG_REASON);
  });
  it("preserves unrelated model-review flags", () => {
    expect(reviewFlagAfterWeightCorrection("Unknown value from CSV — please correct", "552.720"))
      .toBe("Unknown value from CSV — please correct");
  });
});

describe("saved review status", () => {
  it.each(Object.keys(clean))("keeps Needs Review when %s remains", (field) => {
    expect(hasBatteryReviewFlags({ ...clean, [field]: "Needs attention" })).toBe(true);
  });
  it("switches to Resolved only when every saved flag is cleared", () => {
    expect(hasBatteryReviewFlags(clean)).toBe(false);
    expect(reviewSaveSummary([clean])).toEqual({
      title: "Review resolved", description: "1 item is resolved.",
    });
  });
  it("reports the remaining flags rather than claiming bulk success", () => {
    expect(reviewSaveSummary([clean, { ...clean, manufacturerFlagReason: "Other" }])).toEqual({
      title: "Some items still need review",
      description: "1 item is resolved. 1 item still needs review. Complete the remaining flagged fields.",
    });
  });
});
