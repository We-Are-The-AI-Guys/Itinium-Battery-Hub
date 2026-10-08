import { describe, expect, it } from "vitest";
import { collectionReleaseSummary } from "../collection-release";

const row = {
  id: 1, palletNumber: "1", cellType: "3PzS375", estimatedWeightKg: "272.160",
  cellModelFlagReason: null, voltageFlagReason: null, notes: null, adminNotes: null,
};

describe("collector release summary", () => {
  it("counts pallets, not battery rows", () => {
    expect(collectionReleaseSummary([row, { ...row, id: 2 }, { ...row, id: 3, palletNumber: " 2 " }]).palletCount).toBe(2);
  });
  it("keeps provisional notes visible without exposing unrelated financial fields", () => {
    const summary = collectionReleaseSummary([{ ...row, cellType: null, estimatedWeightKg: "700",
      notes: "Identify at collection", adminNotes: "Check label under cover" }]);
    expect(summary.provisionalItems).toEqual([{
      id: 1, palletNumber: "1", cellType: null, notes: "Identify at collection\nCheck label under cover",
    }]);
  });
  it("reports missing pallets and missing weights", () => {
    const summary = collectionReleaseSummary([{ ...row, palletNumber: "", estimatedWeightKg: null }]);
    expect(summary.missingPalletRows).toBe(1);
    expect(summary.palletCount).toBe(0);
    expect(summary.provisionalItems).toHaveLength(1);
  });
  it("does not warn on a fully specified row", () => {
    expect(collectionReleaseSummary([row]).provisionalItems).toEqual([]);
  });
});
