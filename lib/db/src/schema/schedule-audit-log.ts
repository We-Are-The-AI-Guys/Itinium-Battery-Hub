import { pgTable, serial, integer, varchar, date, timestamp, index } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { usersTable } from "./users";

export const scheduleRescheduleLogTable = pgTable("schedule_reschedule_log", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  jobReference: varchar("job_reference", { length: 50 }).notNull(),
  oldDate: date("old_date"),
  newDate: date("new_date").notNull(),
  changedById: integer("changed_by_id").notNull().references(() => usersTable.id),
  changedByName: varchar("changed_by_name", { length: 255 }).notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
}, (table) => [
  index("idx_reschedule_log_job_id").on(table.jobId),
  index("idx_reschedule_log_changed_at").on(table.changedAt),
]);

export type ScheduleRescheduleLog = typeof scheduleRescheduleLogTable.$inferSelect;
