export interface BatteryReviewFlags {
  serialFlagReason: string | null;
  manufacturerFlagReason: string | null;
  cellModelFlagReason: string | null;
  voltageFlagReason: string | null;
}

export function hasBatteryReviewFlags(battery: BatteryReviewFlags): boolean {
  return !!(battery.serialFlagReason || battery.manufacturerFlagReason
    || battery.cellModelFlagReason || battery.voltageFlagReason);
}

export function reviewSaveSummary(batteries: BatteryReviewFlags[]) {
  const remaining = batteries.filter(hasBatteryReviewFlags).length;
  const resolved = batteries.length - remaining;
  return {
    title: remaining ? "Some items still need review" : "Review resolved",
    description: `${resolved} ${resolved === 1 ? "item is" : "items are"} resolved.${remaining
      ? ` ${remaining} ${remaining === 1 ? "item still needs" : "items still need"} review. Complete the remaining flagged fields.`
      : ""}`,
  };
}
