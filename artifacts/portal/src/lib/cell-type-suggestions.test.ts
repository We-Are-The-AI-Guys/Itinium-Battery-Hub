import { describe, expect, it } from "vitest";
import { selectPreferredCatalogueModel } from "./cell-type-suggestions";

const models = [
  { manufacturer: "TAB", modelName: "4 PzS 460" },
  { manufacturer: "Exide / GNB", modelName: "4 EPzS 460" },
  { manufacturer: "Hoppecke", modelName: "4 HPzS 460" },
  { manufacturer: "Hoppecke", modelName: "6 HPzS 750" },
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
});