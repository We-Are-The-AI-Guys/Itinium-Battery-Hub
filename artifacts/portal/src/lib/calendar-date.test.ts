import { describe, expect, it } from "vitest";
import { calendarDate } from "./calendar-date";

describe("schedule day keys", () => {
  it.each([[2026, 10, 6], [2026, 3, 29], [2026, 10, 25], [2027, 1, 1]])(
    "preserves local midnight for %s-%s-%s", (year, month, day) => {
      expect(calendarDate(new Date(year, month - 1, day))).toBe(
        `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    });
});
