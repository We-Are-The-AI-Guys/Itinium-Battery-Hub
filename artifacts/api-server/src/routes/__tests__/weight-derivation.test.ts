import { describe, it, expect } from "vitest";
import {
  applyTokenWeightFallback,
  canonicalizeSubmittedVoltage,
  deriveEstimatedWeightKg,
  derivePbContentKg,
  deriveTabGrossWeightKg,
  flagOtherSelectionsForReview,
  parsePositiveLooseCellQuantity,
  parsePositiveWeightKg,
} from "../jobs";

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
  { manufacturer: "Hoppecke", modelName: "6 PzBH 390", weightPerCellKg: "18.900", pbContentKgPerCell: "18.900", cellsCount: 6 },
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

  it("uses the verified Hoppecke PzBH designation for weight and Pb", () => {
    expect(deriveEstimatedWeightKg(catalogue, "Hoppecke", "6 PzBH 390", 12)).toBe("226.800");
    expect(derivePbContentKg(catalogue, "Hoppecke", "6 PzBH 390", 12)).toBe("226.800");
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
  const tabCatalogue = [
    { manufacturer: "TAB", modelName: "3PzS375", weightPerCellKg: "16.200", pbContentKgPerCell: "16.200", cellsCount: 3 },
    { manufacturer: "TAB", modelName: "5PzS775", weightPerCellKg: "32.900", pbContentKgPerCell: "32.900", cellsCount: 5 },
    { manufacturer: "TAB", modelName: "4PzS620", weightPerCellKg: "26.700", pbContentKgPerCell: "26.700", cellsCount: 4 },
    { manufacturer: "TAB", modelName: "7PzS560", weightPerCellKg: "24.700", pbContentKgPerCell: "24.700", cellsCount: 7 },
    { manufacturer: "TAB", modelName: "4PzS500", weightPerCellKg: "21.100", pbContentKgPerCell: "21.100", cellsCount: 4 },
  ];

  it.each([
    ["3 EPzS 375", 24, "544.320"],
    ["5 EPzS 775", 24, "1105.440"],
    ["4 EPzS 620", 24, "897.120"],
    ["7 EPzS 560", 24, "829.920"],
    ["7 EPzS 560", 40, "1383.200"],
    ["4 EPzS 500", 12, "354.480"],
  ] as const)("recognises %s as its TAB PzS equivalent with %i actual cells", (model, cells, gross) => {
    expect(deriveTabGrossWeightKg(tabCatalogue, model, cells)).toBe(gross);
    const normalWeight = deriveEstimatedWeightKg(tabCatalogue, "Unknown", model, cells);
    expect(Number(normalWeight) * 1.4).toBeCloseTo(Number(gross), 3);
  });

  it("ignores case, spacing and punctuation without changing the supplied model", () => {
    const battery = Object.freeze({ cellType: " 5-ePzS-775 ", manufacture: "Exide / GNB" });
    expect(deriveTabGrossWeightKg(tabCatalogue, battery.cellType, 24)).toBe("1105.440");
    expect(battery.cellType).toBe(" 5-ePzS-775 ");
    expect(battery.manufacture).toBe("Exide / GNB");
  });

  it("uses loose-cell quantity and applies the safety factor only once", () => {
    expect(deriveTabGrossWeightKg(tabCatalogue, "5 EPzS 775", 13)).toBe("598.780");
  });

  it("does not substitute another capacity, family, suffix or manufacturer", () => {
    expect(deriveTabGrossWeightKg(tabCatalogue, "4 EPzS 560", 24)).toBeNull();
    expect(deriveTabGrossWeightKg(tabCatalogue, "5 EPzB 775", 24)).toBeNull();
    expect(deriveTabGrossWeightKg(tabCatalogue, "5 EPzS 775 L", 24)).toBeNull();
    expect(deriveTabGrossWeightKg(catalogue, "5 EPzS 775", 24)).toBeNull();
    expect(deriveTabGrossWeightKg(tabCatalogue, "5 EPzS 775", null)).toBeNull();
    expect(deriveTabGrossWeightKg(tabCatalogue, "5 EPzS 775", 0)).toBeNull();
  });

  it("uses TAB even when the item has another manufacturer and applies the safe-load factor", () => {
    expect(deriveTabGrossWeightKg(catalogue, "5 EPzS 700", 24)).toBe("1041.600");
  });

  it("fails explicitly when TAB has no matching default", () => {
    expect(deriveTabGrossWeightKg(catalogue, "6 PzS 750", 24)).toBeNull();
    expect(deriveTabGrossWeightKg(catalogue, "Other", 24)).toBeNull();
  });
});

describe("canonicalizeSubmittedVoltage", () => {
  it("stores numeric shorthand in the same format as catalogue voltages", () => {
    expect(canonicalizeSubmittedVoltage("24")).toBe("24V");
    expect(canonicalizeSubmittedVoltage(" 48v ")).toBe("48V");
  });

  it("keeps blank voltage absent", () => {
    expect(canonicalizeSubmittedVoltage("")).toBeNull();
    expect(canonicalizeSubmittedVoltage(null)).toBeNull();
  });
});

describe("parsePositiveLooseCellQuantity", () => {
  it("accepts only positive whole-cell quantities", () => {
    expect(parsePositiveLooseCellQuantity("15")).toBe(15);
    expect(parsePositiveLooseCellQuantity(15)).toBe(15);
    expect(parsePositiveLooseCellQuantity("1.5")).toBeNull();
    expect(parsePositiveLooseCellQuantity("15 cells")).toBeNull();
    expect(parsePositiveLooseCellQuantity("0")).toBeNull();
    expect(parsePositiveLooseCellQuantity("")).toBeNull();
  });
});

describe("parsePositiveWeightKg", () => {
  it("accepts valid decimal weights without permissive truncation", () => {
    expect(parsePositiveWeightKg("500")).toBe(500);
    expect(parsePositiveWeightKg("500.25")).toBe(500.25);
    expect(parsePositiveWeightKg(".5")).toBe(0.5);
  });

  it("rejects malformed, scientific, zero, and negative weights", () => {
    expect(parsePositiveWeightKg("500kg")).toBeNull();
    expect(parsePositiveWeightKg("1e3")).toBeNull();
    expect(parsePositiveWeightKg("0")).toBeNull();
    expect(parsePositiveWeightKg("-1")).toBeNull();
    expect(parsePositiveWeightKg("")).toBeNull();
  });
});

describe("applyTokenWeightFallback", () => {
  it("adds a 500kg token and review flag when a row has no usable weight", () => {
    const battery = { estimatedWeightKg: null, cellModelFlagReason: null };
    applyTokenWeightFallback(battery);
    expect(battery.estimatedWeightKg).toBe("500");
    expect(battery.cellModelFlagReason).toMatch(/500kg token weight/i);
  });

  it("preserves an existing valid weight and review reason", () => {
    const battery = { estimatedWeightKg: "725.5", cellModelFlagReason: "Existing review" };
    applyTokenWeightFallback(battery);
    expect(battery).toEqual({
      estimatedWeightKg: "725.5",
      cellModelFlagReason: "Existing review",
    });
  });
});

describe("submitted Other values", () => {
  it("flags both fields even if a client omitted or cleared their flags", () => {
    const battery = { manufacture: "Other", cellType: "Other", manufacturerFlagReason: null, cellModelFlagReason: null };
    flagOtherSelectionsForReview(battery);
    expect(battery.manufacturerFlagReason).toMatch(/requires Itinium review/);
    expect(battery.cellModelFlagReason).toMatch(/requires Itinium review/);
  });

  it("leaves a typed unknown manufacturer and designation intact", () => {
    const battery = { manufacture: "New Supplier", cellType: "4P" };
    flagOtherSelectionsForReview(battery);
    expect(battery).toEqual({ manufacture: "New Supplier", cellType: "4P" });
    expect(deriveEstimatedWeightKg(catalogue, battery.manufacture, battery.cellType, 12)).toBeNull();
  });
});
