export interface ReleaseRow {
  id: number;
  palletNumber: string | null;
  cellType: string | null;
  estimatedWeightKg: string | null;
  cellModelFlagReason: string | null;
  voltageFlagReason: string | null;
  notes: string | null;
  adminNotes: string | null;
}

export function collectionReleaseSummary(rows: ReleaseRow[]) {
  const provisionalItems = rows.filter((row) =>
    !row.cellType?.trim() || !!row.cellModelFlagReason || !!row.voltageFlagReason ||
    !(Number(row.estimatedWeightKg) > 0)
  ).map((row) => ({
    id: row.id,
    palletNumber: row.palletNumber,
    cellType: row.cellType,
    notes: [row.notes, row.adminNotes].filter(Boolean).join("\n"),
  }));
  return {
    palletCount: new Set(rows.map((row) => row.palletNumber?.trim().toLowerCase()).filter(Boolean)).size,
    missingPalletRows: rows.filter((row) => !row.palletNumber?.trim()).length,
    provisionalItems,
  };
}
