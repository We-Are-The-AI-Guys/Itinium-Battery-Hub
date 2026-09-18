import { describe, expect, it } from "vitest";
import { canDownloadRawCollectionSheet, collectionSheetInstructions } from "../jobs";

const staffRoles = ["team_leader", "accounts", "head_office_admin"];

describe("raw collection sheet access", () => {
  it.each(staffRoles)("keeps access available for %s", (role) => {
    expect(canDownloadRawCollectionSheet(
      { role, collectionCompanyId: null },
      { collectionCompanyId: 10, scheduleStatus: "proposed" }
    )).toBe(true);
  });

  it("allows the assigned collection company after Itinium confirms the schedule", () => {
    expect(canDownloadRawCollectionSheet(
      { role: "collection_company", collectionCompanyId: 10 },
      { collectionCompanyId: 10, scheduleStatus: "confirmed" }
    )).toBe(true);
  });

  it.each(["unassigned", "proposed"])("blocks the collection company while schedule is %s", (scheduleStatus) => {
    expect(canDownloadRawCollectionSheet(
      { role: "collection_company", collectionCompanyId: 10 },
      { collectionCompanyId: 10, scheduleStatus }
    )).toBe(false);
  });

  it("blocks a collection company assigned to a different job", () => {
    expect(canDownloadRawCollectionSheet(
      { role: "collection_company", collectionCompanyId: 20 },
      { collectionCompanyId: 10, scheduleStatus: "confirmed" }
    )).toBe(false);
  });

  it("blocks an unlinked collection-company account", () => {
    expect(canDownloadRawCollectionSheet(
      { role: "collection_company", collectionCompanyId: null },
      { collectionCompanyId: 10, scheduleStatus: "confirmed" }
    )).toBe(false);
  });
});

describe("collection sheet loading instructions", () => {
  it.each([null, undefined, "", "   ", "\n\t"])(
    "prints None when instructions are blank (%s)",
    (value) => {
      expect(collectionSheetInstructions(value)).toBe("None");
    }
  );

  it("prints entered instructions after trimming outer whitespace", () => {
    expect(collectionSheetInstructions("  Use rear loading bay  ")).toBe("Use rear loading bay");
  });
});