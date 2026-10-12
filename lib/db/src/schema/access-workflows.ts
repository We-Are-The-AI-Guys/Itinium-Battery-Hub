import { pgTable, serial, integer, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { jobsTable } from "./jobs";

export const actionRequestsTable = pgTable("action_requests", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id),
  requesterId: integer("requester_id").notNull().references(() => usersTable.id),
  kind: text("kind").notNull(),
  notes: text("notes").notNull(),
  outcome: text("outcome"),
  status: text("status").notNull().default("Pending"),
  decisionNotes: text("decision_notes"),
  decidedById: integer("decided_by_id").references(() => usersTable.id),
  decidedAt: timestamp("decided_at"),
  notificationStatus: text("notification_status").notNull().default("Pending configuration"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const supportEnquiriesTable = pgTable("support_enquiries", {
  id: serial("id").primaryKey(),
  requesterId: integer("requester_id").notNull().references(() => usersTable.id),
  title: text("title").notNull(),
  details: text("details").notNull(),
  status: text("status").notNull().default("New"),
  notificationStatus: text("notification_status").notNull().default("Pending configuration"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const accessSettingsTable = pgTable("access_settings", {
  id: integer("id").primaryKey().default(1),
  operationsEmail: text("operations_email"),
  supportEmail: text("support_email"),
  senderEmail: text("sender_email"),
});
export const accessAuditTable = pgTable("access_audit", {
  id: serial("id").primaryKey(),
  actorId: integer("actor_id").references(() => usersTable.id),
  action: text("action").notNull(),
  jobId: integer("job_id").references(() => jobsTable.id),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const exceptionEvidenceTable = pgTable("exception_evidence", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id").notNull().references(() => actionRequestsTable.id),
  objectPath: text("object_path").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
