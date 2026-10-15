import { afterAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { db, pool } from "@workspace/db";
import { reportingNetTonnage, reportingWeightConfirmed } from "../reporting-net-weight";

// Read-only SQL: CTEs shadow both tables with fictional values. No real job,
// battery, user or schema is read or changed, and no fixtures are persisted.
const fixtures = sql`
  WITH jobs(id, tonnage) AS (
    VALUES (1, 14::numeric), (2, 14), (3, 14), (4, 14), (5, 99),
           (6, 14), (7, 14), (8, 14), (9, 14)
  ), job_batteries(job_id, estimated_weight_kg, pb_content_kg, receipt_reviewed, receipt_confirmed) AS (
    VALUES
      (1, 7000::numeric, 5000::numeric, false, false), (1, 7000, 5000, false, false),
      (2, 7000, 4000, true, true), (2, 7000, 5000, false, false),
      (3, 7000, 4000, true, true), (3, 7000, 5000, true, false),
      (4, 7000, 4000, true, false), (4, 7000, 5000, true, false),
      (6, 7000, NULL, true, true),
      (7, NULL, 5000, false, false),
      (8, 14000, 8000, NULL, true),
      (9, 7000, 4000, true, true), (9, 7000, 3000, true, true)
  )`;

afterAll(async () => { await pool.end(); });
describe("net reporting calculation against PostgreSQL fictional records", () => {
  it("retains estimates until complete, then uses only accepted Pb; never substitutes gross or partial totals", async () => {
    const result = await db.execute(sql`${fixtures}
      SELECT id, ${reportingNetTonnage()} AS net, ${reportingWeightConfirmed()} AS confirmed
      FROM jobs ORDER BY id`);
    expect(result.rows.map(row => [row.id, row.net == null ? null : Number(row.net), row.confirmed])).toEqual([
      [1, 10, false], [2, 10, false], [3, 4, true], [4, 0, true],
      [5, null, false], [6, null, true], [7, null, false], [8, 10, false], [9, 7, true],
    ]);
  });
  it("aggregates each job once and uses identical net values for monthly reports", async () => {
    const result = await db.execute(sql`${fixtures}
      SELECT SUM(${reportingNetTonnage()}) AS total FROM jobs`);
    expect(Number(result.rows[0].total)).toBe(41);
  });
});
