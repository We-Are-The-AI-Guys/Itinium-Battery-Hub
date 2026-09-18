import { describe, it, expect } from "vitest";
import { deriveEstimatedWeightKg, derivePbContentKg, deriveTabGrossWeightKg } from "../jobs";

// Catalogue fixtures mirror the real cell-model data shape. Weights are the
// client's Pb-per-cell figures (the catalogue deliberately stores Pb, not
// gross battery weight); the x1.4 safe-load factor is applied by callers.
const catalogue = [
  { manufacturer: "Exide / GNB", modelName: "5 EPzS 700", weightPerCellKg: "30.900", pbContentKgPerCell: "30.900", cellsCount: 5 },
  { manufacturer: "TAB", modelName: "5 EPzS 700", weightPerCellKg: "31.000", pbContentKgPerCell: "31.000", cellsCount: 5 },
  { manufacturer: "Hoppecke", modelName: "5 EPzS 700", weightPerCellKg: "31.100", pbContentKgPerCell: "31.100", cellsCount: 5 },
  { manufacturer: "Exide / GNB", modelName: "5 EPzS 775", weightPerCellKg: "32.900", pbContentKgPerCell: "32.900", cellsCount: 5 },
  { manufacturer: "Hawker", modelName: "6 PzS 750", weightPerCellKg: "33.500", pbContentKgPerCell: null, cellsCount: 6 },
  { manufacturer: "TAB", modelName: "4 PzS 460", weightPerCellKg: "19.900", pbContentKgPerCell: "19.900", cellsCount: 4 },
  { manufacturer: "Exide / GNB", modelName: "4 EPzS 460", weightPerCellKg: "18.500", pbContentKgPerCell: "18.500", cellsCount: 4 },
];

describe("deriveEstimatedWeightKg — the fix behind the 67kg CSV/manual discrepancy", () => {
  it("derives from the row's CURRENT cell type (a corrected cell type never keeps the old model's weight)", () => {
    // 48V => 24 cells. "5 EPzS 700" must use 30.900, not the 775's 32.900.
    expect(deriveEstimatedWeightKg(catalogue, "Exide / GNB", "5 EPzS 700", 24)).toBe("741.600");
    expect(deriveEstimatedWeightKg(catalogue, "Exide / GNB", "5 EPzS 775", 24)).toBe("789.600");
    // The 67kg discrepancy: (32.9 - 30.9) x 24 x 1.4 = 67.2kg gross.
    const wrong = parseFloat(deriveEstimatedWeightKg(catalogue, "Exide / GNB", "5 EPzS 775", 24)!) * 1.4;
    const right = parseFloat(deriveEstimatedWeightKg(catalogue, "Exide / GNB", "5 EPzS 700", 24)!) * 1.4;
    expect(wrong - right).toBeCloseTo(67.2, 3);
  });

  it("matches exact manufacturer first and uses TAB only as a fallback", () => {
    expect(deriveEstimatedWeightKg(catalogue, "Hoppecke", "5 EPzS 700", 1)).toBe("31.100");
    // Unknown manufacturer falls back to TAB.
    expect(deriveEstimatedWeightKg(catalogue, "SomeOther Co", "5 EPzS 700", 1)).toBe("31.000");
    expect(deriveEstimatedWeightKg(catalogue, "unknown", "5 EPzS 700", 1)).toBe("31.000");
    expect(deriveEstimatedWeightKg(catalogue, null, "5 EPzS 700", 1)).toBe("31.000");
    // Never use another manufacturer's rate when neither requested nor TAB exists.
    expect(deriveEstimatedWeightKg(catalogue, "Nobody", "6 PzS 750", 1)).toBeNull();
  });

  it("ignores case and spacing in cell model names", () => {
    expect(deriveEstimatedWeightKg(catalogue, "Exide / GNB", "5epzs700", 24)).toBe("741.600");
    expect(deriveEstimatedWeightKg(catalogue, "Exide / GNB", " 5 EPZS 700 ", 24)).toBe("741.600");
  });

  it("uses a manufacturer's prefixed model before the generic TAB model", () => {
    expect(deriveEstimatedWeightKg(catalogue, "GNB", "4 PzS 460", 12)).toBe("222.000");
    expect(deriveEstimatedWeightKg(catalogue, "Unknown", "4 PzS 460", 12)).toBe("238.800");
  });

  it("uses the cell count from voltage or loose quantity, never the digits in the model name", () => {
    // 24V battery => 12 cells even for "5 EPzS 700" (not 5).
    expect(deriveEstimatedWeightKg(catalogue, "Exide / GNB", "5 EPzS 700", 12)).toBe("370.800");
    // Loose cells: quantity is the cell count.
    expect(deriveEstimatedWeightKg(catalogue, "Exide / GNB", "5 EPzS 700", 3)).toBe("92.700");
  });

  it("returns null when it cannot derive (unknown model, no cell count, Blocs/Other)", () => {
    expect(deriveEstimatedWeightKg(catalogue, "Exide / GNB", "Nonexistent 123", 24)).toBeNull();
    expect(deriveEstimatedWeightKg(catalogue, "Exide / GNB", "5 EPzS 700", null)).toBeNull();
    expect(deriveEstimatedWeightKg(catalogue, "Exide / GNB", "5 EPzS 700", 0)).toBeNull();
    expect(deriveEstimatedWeightKg(catalogue, "Exide / GNB", "Blocs", 24)).toBeNull();
    expect(deriveEstimatedWeightKg(catalogue, "Exide / GNB", "Other", 24)).toBeNull();
    expect(deriveEstimatedWeightKg(catalogue, "Exide / GNB", "", 24)).toBeNull();
  });
});

describe("derivePbContentKg", () => {
  it("uses the same matching rules and multiplies by the actual cell count", () => {
    expect(derivePbContentKg(catalogue, "Exide / GNB", "5 EPzS 700", 24)).toBe("741.600");
    expect(derivePbContentKg(catalogue, "Unknown", "5 EPzS 700", 12)).toBe("372.000"); // TAB fallback
  });

  it("skips catalogue entries without Pb data", () => {
    // "6 PzS 750" has weight but null Pb — no Pb derivation possible.
    expect(derivePbContentKg(catalogue, "Hawker", "6 PzS 750", 24)).toBeNull();
  });
});

describe("deriveTabGrossWeightKg", () => {
  it("uses TAB even when the item has another manufacturer and applies the safe-load factor", () => {
    expect(deriveTabGrossWeightKg(catalogue, "5 EPzS 700", 24)).toBe("1041.600");
  });

  it("fails explicitly when TAB has no matching default", () => {
    expect(deriveTabGrossWeightKg(catalogue, "6 PzS 750", 24)).toBeNull();
    expect(deriveTabGrossWeightKg(catalogue, "Other", 24)).toBeNull();
  });
});
