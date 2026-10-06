import { describe, expect, it } from "vitest";
import { reconcileBatteryReview, reconcileTokenWeightReview, TOKEN_WEIGHT_FLAG_REASON } from "./battery-review";

const clean = {
  serialFlagReason: null,
  manufacturerFlagReason: null,
  cellModelFlagReason: null,
  voltageFlagReason: null,
  cellType: "5 PzS 700",
  isLooseCells: false,
};

describe("500kg token warning after corrections", () => {
  const existing = { ...clean, cellModelFlagReason: TOKEN_WEIGHT_FLAG_REASON };

  const replacementCases: Array<Record<string, string | number | boolean | Date | null>> = [
    { voltage: "24V", estimatedWeightKg: "552.720" },
    { manufacture: "TAB", estimatedWeightKg: "552.720" },
    { looseCellsQty: 12, estimatedWeightKg: "552.720" },
    { cellType: "5 PzS 700", cellModelFlagReason: null, estimatedWeightKg: "552.720" },
    { receiptConfirmed: true, estimatedWeightKg: "552.720", weightManual: false },
  ];
  it.each(replacementCases)("clears the token warning only with a saved replacement weight: %j", (input) => {
    const updates = { ...input };
    reconcileTokenWeightReview(existing, updates);
    expect(updates.cellModelFlagReason).toBeNull();
    expect(reconcileBatteryReview(existing, updates, 7, true)).toBe(true);
  });

  it.each([undefined, null, "", "0", "-1", "NaN", "500kg"])(
    "keeps the token warning if a model edit has no valid replacement weight (%s)", (weight) => {
      const updates: Record<string, string | number | boolean | Date | null> = {
        cellType: "Unknown model", cellModelFlagReason: null,
        ...(weight !== undefined ? { estimatedWeightKg: weight } : {}),
      };
      reconcileTokenWeightReview(existing, updates);
      expect(updates.cellModelFlagReason).toBe(TOKEN_WEIGHT_FLAG_REASON);
      expect(reconcileBatteryReview(existing, updates, 7, true)).toBe(false);
    },
  );

  it("preserves other review reasons when replacing a weight", () => {
    const updates = { estimatedWeightKg: "552.720" };
    reconcileTokenWeightReview({ cellModelFlagReason: "Unknown model" }, updates);
    expect(updates).not.toHaveProperty("cellModelFlagReason");
  });

  it("preserves a new identity flag even if the old weight is replaced", () => {
    const updates = { estimatedWeightKg: "552.720", cellModelFlagReason: "Other — requires Itinium review" };
    reconcileTokenWeightReview(existing, updates);
    expect(updates.cellModelFlagReason).toBe("Other — requires Itinium review");
  });

  it("does not infer a token from the numerical weight alone", () => {
    const updates = { estimatedWeightKg: "700.000" };
    reconcileTokenWeightReview(clean, updates);
    expect(updates).not.toHaveProperty("cellModelFlagReason");
  });

  it("keeps the warning when no weight update was made, including protected manual weights", () => {
    const updates = { voltage: "24V" };
    reconcileTokenWeightReview(existing, updates);
    expect(updates).not.toHaveProperty("cellModelFlagReason");
    expect(reconcileBatteryReview(existing, updates, 7, true)).toBe(false);
  });
});

describe("battery review after saved corrections", () => {
  it.each(["Unknown", "N/A", "", "Other", "none", "-", "?", null])(
    "automatically clears the manufacturer-only review for %s", (manufacture) => {
      const updates = { notes: "Saved" };
      expect(reconcileBatteryReview({
        ...clean, manufacture, manufacturerFlagReason: "Missing from CSV",
      }, updates, 7, false)).toBe(true);
      expect(updates).toMatchObject({ manufacturerFlagReason: null });
    },
  );

  it("retains independent model and voltage reviews on unknown-manufacturer rows", () => {
    const updates = { notes: "Saved" };
    expect(reconcileBatteryReview({
      ...clean, manufacture: "Unknown", manufacturerFlagReason: "Missing from CSV",
      cellModelFlagReason: "Missing model", voltageFlagReason: "Missing voltage",
    }, updates, 7, false)).toBe(false);
    expect(updates).toMatchObject({ manufacturerFlagReason: null, resolvedAt: null });
    expect(updates).not.toHaveProperty("cellModelFlagReason");
    expect(updates).not.toHaveProperty("voltageFlagReason");
  });

  it.each([
    "serialFlagReason", "manufacturerFlagReason", "cellModelFlagReason", "voltageFlagReason",
  ])("finishes review when %s is the last flag corrected", (field) => {
    const updates = { [field]: null };
    expect(reconcileBatteryReview({ ...clean, [field]: "Needs attention" }, updates, 7, true)).toBe(true);
    expect(updates).toMatchObject({ resolvedById: 7, resolvedAt: expect.any(Date) });
  });
  it("does not turn an empty request into a review update", () => {
    const updates = {};
    expect(reconcileBatteryReview({ ...clean, cellModelFlagReason: "Unknown" }, updates, 7, true)).toBe(false);
    expect(updates).toEqual({});
  });
  it("marks the last corrected flag resolved with the reviewer and date", () => {
    const updates = { cellType: "5 PzS 700", cellModelFlagReason: null };
    expect(reconcileBatteryReview({ ...clean, cellModelFlagReason: "Unknown" }, updates, 7, true)).toBe(true);
    expect(updates).toMatchObject({ resolvedById: 7, resolvedAt: expect.any(Date) });
  });

  it("keeps a partly corrected row under review without a resolution stamp", () => {
    const updates = { cellType: "5 PzS 700", cellModelFlagReason: null };
    expect(reconcileBatteryReview({
      ...clean, cellModelFlagReason: "Unknown", manufacturerFlagReason: "Missing",
    }, updates, 7, true)).toBe(false);
    expect(updates).toMatchObject({ resolvedById: null, resolvedAt: null });
  });

  it.each(["Blocs", " blocs "])("clears a stale voltage flag when corrected to %s", (cellType) => {
    const updates = { cellType, cellModelFlagReason: null };
    expect(reconcileBatteryReview({
      ...clean, cellModelFlagReason: "Unknown", voltageFlagReason: "Missing",
    }, updates, 7, true)).toBe(true);
    expect(updates).toMatchObject({ voltageFlagReason: null, resolvedById: 7 });
  });

  it("clears a stale voltage flag on corrected loose cells", () => {
    const updates = { looseCellsQty: 10 };
    expect(reconcileBatteryReview({
      ...clean, isLooseCells: true, voltageFlagReason: "Missing",
    }, updates, 7, true)).toBe(true);
    expect(updates).toMatchObject({ voltageFlagReason: null });
  });

  it("resolves an obsolete blank voltage flag when bulk accepting a loose-cell row", () => {
    const updates = { voltage: null };
    expect(reconcileBatteryReview({
      ...clean, isLooseCells: true, voltageFlagReason: "Missing",
    }, updates, 7, true)).toBe(true);
    expect(updates).toMatchObject({ voltageFlagReason: null, resolvedById: 7 });
  });

  it("keeps a genuinely missing voltage flagged when bulk accepting a normal battery", () => {
    const updates = { voltage: null };
    expect(reconcileBatteryReview({
      ...clean, voltageFlagReason: "Missing",
    }, updates, 7, true)).toBe(false);
    expect(updates).not.toHaveProperty("voltageFlagReason");
  });

  it("does not clear the voltage flag on a normal battery", () => {
    const updates = { cellType: "5 PzS 700", cellModelFlagReason: null };
    expect(reconcileBatteryReview({
      ...clean, cellModelFlagReason: "Unknown", voltageFlagReason: "Missing",
    }, updates, 7, true)).toBe(false);
    expect(updates).not.toHaveProperty("voltageFlagReason");
  });

  it("does not resolve Other while its identity flag remains", () => {
    const updates = { cellType: "Other", cellModelFlagReason: "Other — requires Itinium review" };
    expect(reconcileBatteryReview({
      ...clean, cellModelFlagReason: "Unknown", voltageFlagReason: "Missing",
    }, updates, 7, true)).toBe(false);
    expect(updates).toMatchObject({ voltageFlagReason: null, resolvedById: null });
  });

  it("does not remove applicability flags for an unauthorised reviewer", () => {
    const updates = { cellType: "Blocs" };
    expect(reconcileBatteryReview({ ...clean, voltageFlagReason: "Missing" }, updates, 7, false)).toBe(false);
    expect(updates).not.toHaveProperty("voltageFlagReason");
  });

  it("does not stamp never-flagged rows as reviewed", () => {
    const updates = { notes: "Updated note" };
    expect(reconcileBatteryReview(clean, updates, 7, true)).toBe(false);
    expect(updates).not.toHaveProperty("resolvedAt");
  });

  it("removes an old resolution stamp when a new flag is introduced", () => {
    const updates = { cellType: "Other", cellModelFlagReason: "Other — requires Itinium review" };
    expect(reconcileBatteryReview(clean, updates, 7, true)).toBe(false);
    expect(updates).toMatchObject({ resolvedById: null, resolvedAt: null });
  });
});
