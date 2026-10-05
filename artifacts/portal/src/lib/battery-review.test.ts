import { describe, expect, it } from "vitest";
import { hasBatteryReviewFlags, reviewSaveSummary } from "./battery-review";

const clean = {
  serialFlagReason: null, manufacturerFlagReason: null,
  cellModelFlagReason: null, voltageFlagReason: null,
};

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
