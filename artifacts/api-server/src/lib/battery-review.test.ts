import { describe, expect, it } from "vitest";
import { reconcileBatteryReview } from "./battery-review";

const clean = {
  serialFlagReason: null,
  manufacturerFlagReason: null,
  cellModelFlagReason: null,
  voltageFlagReason: null,
  cellType: "5 PzS 700",
  isLooseCells: false,
};

describe("battery review after saved corrections", () => {
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
    const updates = { manufacture: "Other", manufacturerFlagReason: "Other — requires Itinium review" };
    expect(reconcileBatteryReview(clean, updates, 7, true)).toBe(false);
    expect(updates).toMatchObject({ resolvedById: null, resolvedAt: null });
  });
});
