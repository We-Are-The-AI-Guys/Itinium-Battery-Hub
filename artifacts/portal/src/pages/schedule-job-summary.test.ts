import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const scheduleSource = readFileSync(join(process.cwd(), "src/pages/schedule.tsx"), "utf8");
const jobsRouteSource = readFileSync(
  join(process.cwd(), "../api-server/src/routes/jobs.ts"),
  "utf8"
);

describe("schedule job summaries", () => {
  it("requests tonnage and pallet count for scheduled jobs", () => {
    const routeStart = jobsRouteSource.indexOf('"/jobs/schedule"');
    const routeEnd = jobsRouteSource.indexOf('"/jobs/export.xlsx"', routeStart);
    const route = jobsRouteSource.slice(routeStart, routeEnd);
    expect(route).toContain("tonnage: jobsTable.tonnage");
    expect(route).toContain("palletCount:");
    expect(route).toContain("jobBatteriesTable.palletNumber");
  });

  it("shows job number, requesting depot, tonnage, and pallets on schedule cards", () => {
    const blockStart = scheduleSource.indexOf("function JobBlock");
    const blockEnd = scheduleSource.indexOf("function StatusLegend", blockStart);
    const block = scheduleSource.slice(blockStart, blockEnd);
    expect(block).toContain("{job.reference}");
    expect(block).toContain("{job.depot}");
    expect(block).toContain("{tonnageLabel}");
    expect(block).toContain("{palletLabel}");
    expect(block).not.toContain("{job.clientName}");
  });
});