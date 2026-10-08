import { selectPreferredCatalogueModel, type CellModelLite } from "./cell-type-suggestions";
import { calculateReceiptValueGbp } from "./financial-calculations";

export interface ReceiptCatalogueModel extends CellModelLite {
  pbContentKgPerCell?: string | null;
}

/** Display-only derivation. Never add these values to the explicit save patch. */
export function previewReceiptWeight<T extends {
  cellType: string;
  voltage: string;
  pbContentKg: string;
  valueGbp: string;
}>(
  draft: T,
  battery: { manufacture: string | null; isLooseCells: boolean | null; looseCellsQty: number | null },
  dirtyFields: ReadonlySet<string>,
  catalogue: ReceiptCatalogueModel[],
  lmeRate: number | null,
  customerPercent: string,
): T {
  if (!dirtyFields.has("cellType") && !dirtyFields.has("voltage")) return draft;
  const result = { ...draft };
  if (!dirtyFields.has("pbContentKg")) {
    const model = selectPreferredCatalogueModel(
      catalogue.filter((m) => m.pbContentKgPerCell != null),
      battery.manufacture,
      draft.cellType,
    );
    // Mirror the server's cell count and manufacturer/TAB selection rules.
    const tokens = draft.voltage.match(/\d+(?:\.\d+)?/g);
    const volts = tokens?.length === 1 ? Number(tokens[0]) : NaN;
    const count = battery.isLooseCells
      ? Number(battery.looseCellsQty)
      : Number.isInteger(volts) && volts > 0 && volts % 2 === 0 ? volts / 2 : NaN;
    const pb = model ? Number(model.pbContentKgPerCell) * count : NaN;
    result.pbContentKg = Number.isInteger(count) && count > 0 && Number.isFinite(pb) && pb > 0
      ? pb.toFixed(3) : "";
  }
  if (!dirtyFields.has("valueGbp")) {
    const pb = result.pbContentKg.trim() ? Number(result.pbContentKg) : null;
    const value = calculateReceiptValueGbp(pb, lmeRate, customerPercent);
    result.valueGbp = value === null ? "" : value.toFixed(2);
  }
  return result;
}
