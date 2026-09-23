import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { canDownloadRawCollectionSheet, collectionSheetInstructions } from "../jobs";

const staffRoles = ["team_leader", "accounts", "head_office_admin"];
const jobsRouteSource = readFileSync(join(process.cwd(), "src/routes/jobs.ts"), "utf8");

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

describe("confirmed collection PDF layout", () => {
  it("uses landscape format without agreement or signature panels", () => {
    const start = jobsRouteSource.indexOf('"/jobs/:id/invoice.pdf"');
    const end = jobsRouteSource.indexOf("export function canDownloadRawCollectionSheet", start);
    const confirmedPdfRoute = jobsRouteSource.slice(start, end);
    expect(confirmedPdfRoute).toContain('{ layout: "landscape" }');
    expect(confirmedPdfRoute).not.toContain("drawAgreementAndSignatures(");
    expect(confirmedPdfRoute).not.toContain("Please retain a copy for your records");
  });

  it("prints operational collection details but never internal job notes", () => {
    const confirmedStart = jobsRouteSource.indexOf('"/jobs/:id/invoice.pdf"');
    const confirmedEnd = jobsRouteSource.indexOf("export function canDownloadRawCollectionSheet", confirmedStart);
    const confirmedPdfRoute = jobsRouteSource.slice(confirmedStart, confirmedEnd);
    const rawStart = jobsRouteSource.indexOf('"/jobs/:id/collection-sheet.pdf"');
    const rawEnd = jobsRouteSource.indexOf('"/jobs/:id"', rawStart);
    const rawPdfRoute = jobsRouteSource.slice(rawStart, rawEnd);

    for (const route of [confirmedPdfRoute, rawPdfRoute]) {
      expect(route).toContain("job.driverName");
      expect(route).toContain("job.vehicleReg");
      expect(route).toContain("job.siteContacts");
      expect(route).toContain("job.siteHours");
      expect(route).toContain("job.specialInstructions");
      expect(route).not.toContain("job.notes");
    }
  });
});