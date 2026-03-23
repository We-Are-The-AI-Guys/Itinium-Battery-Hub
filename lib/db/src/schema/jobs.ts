import { pgTable, serial, integer, text, timestamp, varchar, decimal, date, index, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { relations } from "drizzle-orm";

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 50 }).notNull().unique(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  depot: varchar("depot", { length: 255 }).notNull(),
  collectionPoint: varchar("collection_point", { length: 255 }),
  collectionDate: date("collection_date"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  tonnage: decimal("tonnage", { precision: 10, scale: 3 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  notes: text("notes"),
  invoiceStatus: varchar("invoice_status", { length: 50 }).default("pending_invoice"),
  lmeRateUsed: decimal("lme_rate_used", { precision: 12, scale: 2 }),
  calculatedValue: decimal("calculated_value", { precision: 12, scale: 2 }),
  submittedById: integer("submitted_by_id").references(() => usersTable.id),
  cblLmeValue: decimal("cbl_lme_value", { precision: 12, scale: 2 }),
  cblLmePercent: decimal("cbl_lme_percent", { precision: 5, scale: 2 }),
  cblLmePrice: decimal("cbl_lme_price", { precision: 12, scale: 2 }),
  transportCost: decimal("transport_cost", { precision: 12, scale: 2 }),
  customerInvoiceValue: decimal("customer_invoice_value", { precision: 12, scale: 2 }),
  customerInvoiceNo: varchar("customer_invoice_no", { length: 100 }),
  cblWasteAdviceNoteNo: varchar("cbl_waste_advice_note_no", { length: 100 }),
  cblDate: date("cbl_date"),
  totalInvoiceValue: decimal("total_invoice_value", { precision: 12, scale: 2 }),
  grossProfit: decimal("gross_profit", { precision: 12, scale: 2 }),
  itiniumInvoiceNo: varchar("itinium_invoice_no", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_jobs_status").on(table.status),
  index("idx_jobs_submitted_at").on(table.submittedAt),
  index("idx_jobs_status_submitted_at").on(table.status, table.submittedAt),
]);

export const jobBatteriesTable = pgTable("job_batteries", {
  id: serial("id").primaryKey(),
  jobId: integer("job_id").notNull().references(() => jobsTable.id, { onDelete: "cascade" }),
  palletNumber: varchar("pallet_number", { length: 100 }),
  assetNumber: varchar("asset_number", { length: 100 }),
  batterySerial: varchar("battery_serial", { length: 100 }),
  manufacture: varchar("manufacture", { length: 255 }),
  cellType: varchar("cell_type", { length: 50 }),
  voltage: varchar("voltage", { length: 50 }),
  looseCellsQty: integer("loose_cells_qty"),
  notes: text("notes"),
  receiptConfirmed: boolean("receipt_confirmed").default(false),
  pbContentKg: decimal("pb_content_kg", { precision: 10, scale: 3 }),
  valueGbp: decimal("value_gbp", { precision: 12, scale: 2 }),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_job_batteries_job_id").on(table.jobId),
]);

export const jobsRelations = relations(jobsTable, ({ many }) => ({
  batteries: many(jobBatteriesTable),
}));

export const jobBatteriesRelations = relations(jobBatteriesTable, ({ one }) => ({
  job: one(jobsTable, {
    fields: [jobBatteriesTable.jobId],
    references: [jobsTable.id],
  }),
}));

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;

export const insertJobBatterySchema = createInsertSchema(jobBatteriesTable).omit({ id: true, createdAt: true });
export type InsertJobBattery = z.infer<typeof insertJobBatterySchema>;
export type JobBattery = typeof jobBatteriesTable.$inferSelect;
