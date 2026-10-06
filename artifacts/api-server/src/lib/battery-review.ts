const FLAG_FIELDS = [
  "serialFlagReason",
  "manufacturerFlagReason",
  "cellModelFlagReason",
  "voltageFlagReason",
] as const;

type ReviewRow = Record<(typeof FLAG_FIELDS)[number], string | null> & {
  cellType: string | null;
  isLooseCells: boolean | null;
  manufacture?: string | null;
};
type ReviewUpdates = Record<string, string | boolean | number | Date | null>;

export function isUnknownManufacturerValue(value: string | null | undefined): boolean {
  return ["", "n/a", "na", "unknown", "other", "none", "-", "?"]
    .includes(String(value ?? "").trim().toLowerCase());
}

export const TOKEN_WEIGHT_FLAG_REASON = "Missing battery details — 500kg token weight applied";

/** Remove only the token warning, and only after the stored weight is replaced. */
export function reconcileTokenWeightReview(
  existing: Pick<ReviewRow, "cellModelFlagReason">,
  updates: ReviewUpdates,
): void {
  if (existing.cellModelFlagReason !== TOKEN_WEIGHT_FLAG_REASON) return;
  const weight = updates.estimatedWeightKg;
  const replaced = (typeof weight === "string" || typeof weight === "number")
    && Number.isFinite(Number(weight)) && Number(weight) > 0;
  const reason = updates.cellModelFlagReason;
  // Do not remove a new identity flag introduced by the correction.
  if (reason !== undefined && reason !== null && reason !== TOKEN_WEIGHT_FLAG_REASON) return;
  if (replaced) {
    updates.cellModelFlagReason = null;
  } else if (reason === null) {
    // Correcting a model alone does not prove the temporary weight was replaced.
    updates.cellModelFlagReason = TOKEN_WEIGHT_FLAG_REASON;
  }
}

/** Finish a correction using the remaining flags, not just the flag it cleared. */
export function reconcileBatteryReview(
  existing: ReviewRow,
  updates: ReviewUpdates,
  reviewerId: number,
  canResolveReview: boolean,
): boolean {
  if (Object.keys(updates).length === 0) return false;
  const manufacturer = updates.manufacture !== undefined ? updates.manufacture : existing.manufacture;
  if (manufacturer !== undefined && isUnknownManufacturerValue(String(manufacturer ?? ""))) {
    // Unknown manufacturers are accepted with TAB fallback, not sent for review.
    updates.manufacturerFlagReason = null;
  }
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
