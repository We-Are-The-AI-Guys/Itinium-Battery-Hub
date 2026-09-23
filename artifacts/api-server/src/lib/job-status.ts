import { jobsTable } from "@workspace/db/schema";
import { sql, type SQL } from "drizzle-orm";

export const JOB_STATUSES = [
  "request",
  "confirmed",
  "received",
  "invoice",
  "awaiting_invoice",
  "completed",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export function isJobStatus(value: unknown): value is JobStatus {
  return typeof value === "string" && JOB_STATUSES.includes(value as JobStatus);
}

export function advanceJobStatus(current: string, target: JobStatus): JobStatus {
  if (!isJobStatus(current)) return target;
  return JOB_STATUSES.indexOf(current) >= JOB_STATUSES.indexOf(target) ? current : target;
}

export function advanceJobStatusSql(target: JobStatus): SQL<string> {
  const statusesAtOrAfterTarget = JOB_STATUSES.slice(JOB_STATUSES.indexOf(target));
  return sql<string>`CASE
    WHEN ${jobsTable.status} IN (${sql.join(statusesAtOrAfterTarget.map((status) => sql`${status}`), sql`, `)})
      THEN ${jobsTable.status}
    ELSE ${target}
  END`;
}

export function canUpdateInvoiceMilestones(role: string): boolean {
  return role === "accounts" || role === "head_office_admin";
}
