import { describe, it, expect } from "vitest";
import {
  deriveActualCellCount,
  derivePbContentKg,
  deriveEstimatedWeightKg,
} from "../jobs";

// Regression tests for the manual-entry vs CSV weight discrepancy: the
// server derives battery weights from the cell-model catalogue with the
// same matching rules as Pb (exact manufacturer -> TAB -> any, ignoring
// spacing/case), so a row whose cell type changed after its weight was
// computed can never keep the previous model's weight.

const CATALOGUE = [
  { manufacturer: "Exide / GNB", modelName: "5 EPzS 700", pbContentKgPerCell: "30.900", weightPerCellKg: "30.900", cellsCount: 5 },
  { manufacturer: "Exide / GNB", modelName: "5 EPzS 775", pbContentKgPerCell: "32.900", weightPerCellKg: "32.900", cellsCount: 5 },
  { manufacturer: "TAB", modelName: "5 EPzS700 L", pbContentKgPerCell: "30.900", weightPerCellKg: "30.900", cellsCount: 5 },
  { manufacturer: "TAB", modelName: "4 PzS 460", pbContentKgPerCell: "19.900", weightPerCellKg: "19.900", cellsCount: 4 },
  { manufacturer: "Hoppecke", modelName: "4 PzS 460", pbContentKgPerCell: "20.500", weightPerCellKg: "20.500", cellsCount: 4 },
];

describe("deriveActualCellCount", () => {
  it("derives cells from even voltage (voltage/2)", () => {
    expect(deriveActualCellCount({ voltage: "48V" })).toBe(24);
    expect(deriveActualCellCount({ voltage: "24" })).toBe(12);
  });
  it("uses the quantity for loose cells", () => {
    expect(deriveActualCellCount({ isLooseCells: true, looseCellsQty: "10" })).toBe(10);
  });
  it("rejects ambiguous or odd voltages", () => {
    expect(deriveActualCellCount({ voltage: "12/24V" })).toBeNull();
    expect(deriveActualCellCount({ voltage: "13V" })).toBeNull();
    expect(deriveActualCellCount({ voltage: "" })).toBeNull();
  });
});

describe("deriveEstimatedWeightKg", () => {
  it("derives the raw weight for an exact manufacturer + model match", () => {
    // 30.9 kg/cell x 24 cells = 741.6 (the corrected "5 EPzS 700" figure —
    // never the 775's 789.6)
    expect(deriveEstimatedWeightKg(CATALOGUE, "Exide / GNB", "5 EPzS 700", 24)).toBe("741.600");
    expect(deriveEstimatedWeightKg(CATALOGUE, "Exide / GNB", "5 EPzS 775", 24)).toBe("789.600");
  });
  it("matches ignoring spacing and case", () => {
    expect(deriveEstimatedWeightKg(CATALOGUE, "Exide / GNB", "5epzs700", 24)).toBe("741.600");
    expect(deriveEstimatedWeightKg(CATALOGUE, "Exide / GNB", "5EPZS775", 24)).toBe("789.600");
  });
  it("falls back to TAB, then any manufacturer", () => {
    // Unknown manufacturer -> TAB figure (19.9), not Hoppecke's 20.5
    expect(deriveEstimatedWeightKg(CATALOGUE, "Unknown", "4 PzS 460", 12)).toBe("238.800");
    // Manufacturer that doesn't carry the model -> TAB fallback
    expect(deriveEstimatedWeightKg(CATALOGUE, "Espex", "4 PzS 460", 12)).toBe("238.800");
    // Exact manufacturer wins when present
    expect(deriveEstimatedWeightKg(CATALOGUE, "Hoppecke", "4 PzS 460", 12)).toBe("246.000");
  });
  it("supports loose-cell quantities", () => {
    expect(deriveEstimatedWeightKg(CATALOGUE, "Exide / GNB", "5 EPzS 700", 10)).toBe("309.000");
  });
  it("returns null for Blocs/Other, unknown models, or missing cell count", () => {
    expect(deriveEstimatedWeightKg(CATALOGUE, "Exide / GNB", "Blocs", 24)).toBeNull();
    expect(deriveEstimatedWeightKg(CATALOGUE, "Exide / GNB", "Other", 24)).toBeNull();
    expect(deriveEstimatedWeightKg(CATALOGUE, "Exide / GNB", "No Such Model", 24)).toBeNull();
    expect(deriveEstimatedWeightKg(CATALOGUE, "Exide / GNB", "5 EPzS 700", null)).toBeNull();
  });
});

describe("weight and Pb derivation stay consistent", () => {
  it("uses the same matching rules so weight and Pb can never disagree on the model", () => {
    const pb = derivePbContentKg(CATALOGUE, "Exide / GNB", "5 EPzS 700", 24);
    const weight = deriveEstimatedWeightKg(CATALOGUE, "Exide / GNB", "5 EPzS 700", 24);
    expect(pb).toBe("741.600");
    expect(weight).toBe("741.600");
  });
});
