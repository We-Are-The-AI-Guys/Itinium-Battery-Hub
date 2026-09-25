import { pgTable, serial, integer, text, varchar, timestamp, index } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";
import { usersTable } from "./users";

export const collectionMessagesTable = pgTable("collection_messages", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  authorId: integer("author_id").notNull().references(() => usersTable.id),
  authorName: varchar("author_name", { length: 255 }).notNull(),
  authorRole: varchar("author_role", { length: 50 }).notNull(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_collection_messages_job").on(table.jobId, table.createdAt),
]);

export const collectionAssignmentChangesTable = pgTable("collection_assignment_changes", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  oldDriverName: varchar("old_driver_name", { length: 255 }),
  newDriverName: varchar("new_driver_name", { length: 255 }).notNull(),
  oldVehicleReg: varchar("old_vehicle_reg", { length: 50 }),
  newVehicleReg: varchar("new_vehicle_reg", { length: 50 }).notNull(),
  changedById: integer("changed_by_id").notNull().references(() => usersTable.id),
  changedByName: varchar("changed_by_name", { length: 255 }).notNull(),
  changedAt: timestamp("changed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("idx_collection_assignment_changes_job").on(table.jobId, table.changedAt),
]);