import { describe, expect, it } from "vitest";
import { formatGrossWeightKg } from "./gross-weight";

describe("dashboard gross kilograms", () => {
  it.each([
    [null, "—"], [undefined, "—"], ["", "—"], ["invalid", "—"],
    ["0", "0"], ["0.001", "1"], ["9.876", "9,876"], [14, "14,000"],
  ])("converts stored tonnes %s to %s kg", (input, expected) => {
    expect(formatGrossWeightKg(input)).toBe(expected);
  });
});
