import { pgTable, serial, integer, timestamp, varchar, text, index, uniqueIndex } from "drizzle-orm/pg-core";
import { jobsTable } from "./jobs";

// Post-collection documents uploaded by the collection company: the signed
// collection sheet, the signed consignment note, and their statement to
// Itinium (from which Itinium raises the invoice). One document per type per
// job — re-uploading replaces the previous file's record.
export const JOB_DOCUMENT_TYPES = ["collection_sheet", "consignment_note", "statement"] as const;
export type JobDocumentType = (typeof JOB_DOCUMENT_TYPES)[number];

export const jobDocumentsTable = pgTable("job_documents", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  docType: varchar("doc_type", { length: 30 }).notNull(),
  fileName: varchar("file_name", { length: 255 }).notNull(),
  contentType: varchar("content_type", { length: 100 }).notNull(),
  sizeBytes: integer("size_bytes"),
  // Object storage path ("/objects/uploads/<uuid>") — the file itself lives
  // in the private object dir, not in the database.
  objectPath: text("object_path").notNull(),
  uploadedById: integer("uploaded_by_id"),
  uploadedAt: timestamp("uploaded_at").defaultNow().notNull(),
}, (table) => [
  index("idx_job_documents_job").on(table.jobId),
  uniqueIndex("uq_job_documents_job_type").on(table.jobId, table.docType),
]);

export type JobDocument = typeof jobDocumentsTable.$inferSelect;
