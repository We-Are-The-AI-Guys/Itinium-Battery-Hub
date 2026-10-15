import { sql } from "drizzle-orm";
import { jobsTable } from "@workspace/db/schema";

/**
 * Read-only reporting basis, in tonnes. Never writes the gross loading weight.
 * Partial reviews retain the whole estimate. Completed reviews use only
 * accepted batteries' Pb, never editable Financial Master totals.
 * Missing weights stay unknown, rather than returning a misleading partial sum.
 */
export function reportingNetTonnage() {
  return sql<string | null>`(
    SELECT CASE
      WHEN COUNT(*) = 0 THEN NULL
      WHEN BOOL_AND(rnw.receipt_reviewed IS TRUE) THEN
        CASE WHEN COUNT(*) FILTER (
          WHERE rnw.receipt_confirmed IS TRUE AND rnw.pb_content_kg IS NULL
        ) > 0 THEN NULL
        ELSE COALESCE(SUM(rnw.pb_content_kg) FILTER (WHERE rnw.receipt_confirmed IS TRUE), 0) / 1000 END
      WHEN COUNT(*) FILTER (WHERE rnw.estimated_weight_kg IS NULL) > 0 THEN NULL
      ELSE SUM(rnw.estimated_weight_kg) / 1.4 / 1000
    END
    FROM job_batteries rnw WHERE rnw.job_id = ${jobsTable.id}
  )`;
}

export function reportingWeightConfirmed() {
  return sql<boolean>`(
    SELECT COUNT(*) > 0 AND COALESCE(BOOL_AND(rnw.receipt_reviewed IS TRUE), false)
    FROM job_batteries rnw WHERE rnw.job_id = ${jobsTable.id}
  )`;
}
