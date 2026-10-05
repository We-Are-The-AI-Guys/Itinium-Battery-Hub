const FLAG_FIELDS = [
  "serialFlagReason",
  "manufacturerFlagReason",
  "cellModelFlagReason",
  "voltageFlagReason",
] as const;

type ReviewRow = Record<(typeof FLAG_FIELDS)[number], string | null> & {
  cellType: string | null;
  isLooseCells: boolean | null;
};
type ReviewUpdates = Record<string, string | boolean | number | Date | null>;

/** Finish a correction using the remaining flags, not just the flag it cleared. */
export function reconcileBatteryReview(
  existing: ReviewRow,
  updates: ReviewUpdates,
  reviewerId: number,
  canResolveReview: boolean,
): boolean {
  if (Object.keys(updates).length === 0) return false;
  // Voltage is not required for loose cells, Blocs, or an unidentified Other
  // row. Only reconsider it during an authorised identity/quantity correction.
  const reviewingIdentity = ["cellType", "manufacture", "voltage", "looseCellsQty", "batterySerial", ...FLAG_FIELDS]
    .some((field) => updates[field] !== undefined);
  if (canResolveReview && reviewingIdentity) {
    const cellType = String(updates.cellType !== undefined ? updates.cellType ?? "" : existing.cellType ?? "")
      .trim().toLowerCase();
    if (existing.isLooseCells || cellType === "blocs" || cellType === "other") {
      updates.voltageFlagReason = null;
    }
  }

  const remaining = FLAG_FIELDS.some((field) =>
    updates[field] !== undefined ? !!updates[field] : !!existing[field]
  );
  const hadFlags = FLAG_FIELDS.some((field) => !!existing[field]);
  const clearedFlag = FLAG_FIELDS.some((field) =>
    !!existing[field] && updates[field] === null
  );
  if (remaining) {
    // A partly corrected or re-flagged row must not claim full resolution.
    updates.resolvedById = null;
    updates.resolvedAt = null;
  } else if (hadFlags && clearedFlag) {
    updates.resolvedById = reviewerId;
    updates.resolvedAt = new Date();
    return true;
  }
  return false;
}
