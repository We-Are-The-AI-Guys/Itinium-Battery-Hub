import { describe, expect, it } from "vitest";
import {
  canonicalizeVoltageInput,
  isPositiveIntegerInput,
  isProvisionalLooseCellInput,
  parsePositiveWeightInput,
  rankCellTypeSuggestions,
  selectPreferredCatalogueModel,
} from "./cell-type-suggestions";

const models = [
  { manufacturer: "TAB", modelName: "4 PzS 460" },
  { manufacturer: "Exide / GNB", modelName: "4 EPzS 460" },
  { manufacturer: "Hoppecke", modelName: "4 HPzS 460" },
  { manufacturer: "Hoppecke", modelName: "6 HPzS 750" },
  { manufacturer: "Exide / GNB", modelName: "6 EPzS 930" },
];

describe("manufacturer-specific catalogue selection", () => {
  it("uses the requested manufacturer's model variant before TAB", () => {
    expect(
      selectPreferredCatalogueModel(models, "GNB", "4 PzS 460")?.manufacturer
    ).toBe("Exide / GNB");
  });

  it("uses TAB for unknown manufacturers", () => {
    expect(
      selectPreferredCatalogueModel(models, "Unknown", "4 EPzS 460")?.manufacturer
    ).toBe("TAB");
  });

  it("does not use an unrelated manufacturer's rate", () => {
    expect(
      selectPreferredCatalogueModel(models, "Nobody", "6 PzS 750")
    ).toBeUndefined();
  });

  it("canonicalizes a no-space shorthand to the requested manufacturer's model", () => {
    expect(
      selectPreferredCatalogueModel(models, "Exide / GNB", "6PzS930")?.modelName
    ).toBe("6 EPzS 930");
  });
});

describe("designation suggestions", () => {
  it("offers partial 4P matches without treating the shorthand as a model", () => {
    const suggestions = rankCellTypeSuggestions("4P", "Hoppecke", models);
    expect(suggestions.map((s) => s.modelName)).toContain("4 HPzS 460");
    expect(suggestions.map((s) => s.modelName)).toContain("4 PzS 460");
    expect(selectPreferredCatalogueModel(models, "Hoppecke", "4P")).toBeUndefined();
  });

  it("does not propose an unrelated manufacturer's model for an unknown designation", () => {
    expect(rankCellTypeSuggestions("4P", "Nobody", models).some((s) => s.manufacturer === "TAB")).toBe(true);
  });
});

describe("manual battery input normalization", () => {
  it("adds V to numeric voltage shorthand", () => {
    expect(canonicalizeVoltageInput("24")).toBe("24V");
    expect(canonicalizeVoltageInput(" 48v ")).toBe("48V");
  });

  it("recognizes a reviewable loose-cell row with a manual token weight", () => {
    expect(
      isProvisionalLooseCellInput({
        isLooseCells: true,
        looseCellsQty: "15",
        estimatedWeightKg: "500",
        weightManual: true,
        hasUnknownCellType: true,
      })
    ).toBe(true);
  });

  it("does not treat an automatic or missing weight as provisional", () => {
    expect(
      isProvisionalLooseCellInput({
        isLooseCells: true,
        looseCellsQty: "15",
        estimatedWeightKg: "",
        weightManual: false,
        hasUnknownCellType: true,
      })
    ).toBe(false);
  });

  it("requires loose-cell quantities to be positive whole numbers", () => {
    expect(isPositiveIntegerInput("15")).toBe(true);
    expect(isPositiveIntegerInput("1.5")).toBe(false);
    expect(isPositiveIntegerInput("0")).toBe(false);
    expect(isPositiveIntegerInput("cells: 15")).toBe(false);
  });

  it("accepts only complete positive decimal weight values", () => {
    expect(parsePositiveWeightInput("500")).toBe(500);
    expect(parsePositiveWeightInput("500.25")).toBe(500.25);
    expect(parsePositiveWeightInput("500kg")).toBeNull();
    expect(parsePositiveWeightInput("1e3")).toBeNull();
    expect(parsePositiveWeightInput("0")).toBeNull();
    expect(parsePositiveWeightInput("-1")).toBeNull();
  });
});