import { describe, expect, it } from "vitest";
import { formatReportingNetWeight } from "./reporting-net-weight";

describe("net reporting display", () => {
  it.each([
    [null, "—"], [undefined, "—"], ["", "—"], ["invalid", "—"],
    ["0", "0.000t"], ["0.001", "0.001t"], ["4", "4.000t"],
  ])("formats %s without any gross or financial fallback", (value, expected) => {
    expect(formatReportingNetWeight(value)).toBe(expected);
  });
});
