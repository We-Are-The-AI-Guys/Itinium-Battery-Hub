import { describe, expect, it } from "vitest";
import { previewReceiptWeight } from "./receipt-weight-preview";

const catalogue = [
  { manufacturer: "TAB", modelName: "3PzS375", pbContentKgPerCell: "16.2" },
  { manufacturer: "Exide / GNB", modelName: "3 EPzS 375", pbContentKgPerCell: "17" },
];
const battery = { manufacture: "Unknown", isLooseCells: false, looseCellsQty: null };
const draft = { cellType: "3PzS375", voltage: "24V", pbContentKg: "", valueGbp: "" };
const edited = new Set(["cellType"]);

describe("receipt weight previews", () => {
  it("previews 194.400kg for the corrected unknown-manufacturer row without mutating its draft", () => {
    const preview = previewReceiptWeight(draft, battery, edited, catalogue, 1800, "95");
    expect(preview.pbContentKg).toBe("194.400");
    expect(preview.valueGbp).toBe("332.42");
    expect(draft.pbContentKg).toBe("");
    expect(preview.cellType).toBe("3PzS375");
  });
  it("prefers manufacturer equivalents without renaming the entered model", () => {
    expect(previewReceiptWeight(draft, { ...battery, manufacture: "GNB" }, edited, catalogue, null, "95"))
      .toMatchObject({ pbContentKg: "204.000", cellType: "3PzS375", valueGbp: "" });
  });
  it("updates for voltage and loose-cell quantity", () => {
    expect(previewReceiptWeight({ ...draft, voltage: "48V" }, battery, new Set(["voltage"]), catalogue, null, "95").pbContentKg).toBe("388.800");
    expect(previewReceiptWeight(draft, { ...battery, isLooseCells: true, looseCellsQty: 5 }, edited, catalogue, null, "95").pbContentKg).toBe("81.000");
  });
  it.each(["", "Unknown model", "3P"])("clears stale calculated previews for unresolved model %s", (cellType) => {
    expect(previewReceiptWeight({ ...draft, cellType, pbContentKg: "194.400", valueGbp: "332.42" }, battery, edited, catalogue, 1800, "95"))
      .toMatchObject({ pbContentKg: "", valueGbp: "" });
  });
  it.each(["", "12/24V", "25V"])("does not invent a weight for invalid voltage %s", (voltage) => {
    expect(previewReceiptWeight({ ...draft, voltage }, battery, edited, catalogue, null, "95").pbContentKg).toBe("");
  });
  it("preserves explicit Pb and financial edits while recalculating untouched fields", () => {
    const manual = { ...draft, pbContentKg: "123", valueGbp: "456" };
    expect(previewReceiptWeight(manual, battery, new Set(["cellType", "pbContentKg", "valueGbp"]), catalogue, 1800, "95")).toEqual(manual);
    expect(previewReceiptWeight(manual, battery, new Set(["cellType", "valueGbp"]), catalogue, 1800, "95"))
      .toMatchObject({ pbContentKg: "194.400", valueGbp: "456" });
  });
  it("leaves unchanged saved receipt rows alone", () => {
    expect(previewReceiptWeight(draft, battery, new Set(["notes"]), catalogue, 1800, "95")).toBe(draft);
  });
});
