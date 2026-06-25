import { pgTable, serial, varchar, text, boolean, timestamp, index } from "drizzle-orm/pg-core";

export const correctionAuditLogTable = pgTable("correction_audit_log", {
  id: serial("id").primaryKey(),
  jobReference: varchar("job_reference", { length: 50 }).notNull(),
  fieldName: varchar("field_name", { length: 50 }).notNull(),
  originalValue: text("original_value"),
  suggestedValue: text("suggested_value"),
  wasAccepted: boolean("was_accepted").notNull(),
  confidenceLevel: varchar("confidence_level", { length: 10 }),
  submittedByName: varchar("submitted_by_name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_correction_audit_job_reference").on(table.jobReference),
  index("idx_correction_audit_field_name").on(table.fieldName),
  index("idx_correction_audit_was_accepted").on(table.wasAccepted),
  index("idx_correction_audit_created_at").on(table.createdAt),
]);

export type CorrectionAuditLog = typeof correctionAuditLogTable.$inferSelect;
