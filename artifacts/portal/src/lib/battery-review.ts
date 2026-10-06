import { parsePositiveWeightInput } from "./cell-type-suggestions";
import { isUnknownManufacturerValue } from "./manufacturer-policy";

export const TOKEN_WEIGHT_FLAG_REASON = "Missing battery details — 500kg token weight applied";

export function reviewFlagAfterWeightCorrection(reason: string, correctedWeight: string): string {
  return reason === TOKEN_WEIGHT_FLAG_REASON && parsePositiveWeightInput(correctedWeight) !== null
    ? ""
    : reason;
}

export interface BatteryReviewFlags {
  manufacture?: string | null;
  serialFlagReason: string | null;
  manufacturerFlagReason: string | null;
  cellModelFlagReason: string | null;
  voltageFlagReason: string | null;
}

export function hasBatteryReviewFlags(battery: BatteryReviewFlags): boolean {
  const manufacturerFlag = battery.manufacturerFlagReason
    && (battery.manufacture === undefined || !isUnknownManufacturerValue(battery.manufacture));
  return !!(battery.serialFlagReason || manufacturerFlag
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
