import { pgTable, serial, integer, text, timestamp, varchar, decimal, date, index, boolean, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { locationsTable } from "./locations";
import { clientsTable } from "./clients";
import { relations } from "drizzle-orm";

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 50 }).notNull().unique(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  depot: varchar("depot", { length: 255 }).notNull(),
  clientId: integer("client_id").references(() => clientsTable.id),
  locationId: integer("location_id").references(() => locationsTable.id),
  collectionPoint: varchar("collection_point", { length: 255 }),
  collectionDate: date("collection_date"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  tonnage: decimal("tonnage", { precision: 10, scale: 3 }).notNull(),
  // True when the submitter manually overrode the tonnage instead of using
  // the automatic sum of row weights. Overridden tonnage is never re-synced
  // automatically after battery corrections.
  tonnageManualOverride: boolean("tonnage_manual_override").default(false),
  status: varchar("status", { length: 50 }).notNull().default("request"),
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
  invoiceReceivedDate: date("invoice_received_date"),
  dueDate: date("due_date"),
  datePaid: date("date_paid"),
  daysToPay: integer("days_to_pay"),
  driverName: varchar("driver_name", { length: 255 }),
  vehicleReg: varchar("vehicle_reg", { length: 50 }),
  // Collection scheduling workflow: the assigned transport company proposes
  // a driver/vehicle/date; Itinium confirms (possibly adjusting the date).
  // schedule_status: unassigned -> proposed -> confirmed
  collectionCompanyId: integer("collection_company_id"),
  proposedCollectionDate: date("proposed_collection_date"),
  scheduleStatus: varchar("schedule_status", { length: 30 }).notNull().default("unassigned"),
  siteContacts: text("site_contacts"),
  siteHours: varchar("site_hours", { length: 255 }),
  specialInstructions: text("special_instructions"),
  receiptSentAt: timestamp("receipt_sent_at"),
  receiptSentById: integer("receipt_sent_by_id").references(() => usersTable.id),
  receiptValueSnapshot: decimal("receipt_value_snapshot", { precision: 12, scale: 2 }),
  receiptSnapshot: jsonb("receipt_snapshot"),
  receiptClientDeliveryStatus: varchar("receipt_client_delivery_status", { length: 20 }),
  receiptAccountsDeliveryStatus: varchar("receipt_accounts_delivery_status", { length: 20 }),
  receiptClientRecipients: jsonb("receipt_client_recipients"),
  receiptAccountsRecipients: jsonb("receipt_accounts_recipients"),
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
  cellType: varchar("cell_type", { length: 100 }),
  voltage: varchar("voltage", { length: 50 }),
  looseCellsQty: integer("loose_cells_qty"),
  notes: text("notes"),
  receiptConfirmed: boolean("receipt_confirmed").default(false),
  receiptReviewed: boolean("receipt_reviewed").notNull().default(false),
  pbContentKg: decimal("pb_content_kg", { precision: 10, scale: 3 }),
  valueGbp: decimal("value_gbp", { precision: 12, scale: 2 }),
  estimatedWeightKg: decimal("estimated_weight_kg", { precision: 10, scale: 3 }),
  // True when the weight was supplied by the user (typed or CSV weight
  // column) rather than derived from the cell-model catalogue. Manual
  // weights are never overwritten by automatic re-derivation.
  weightManual: boolean("weight_manual").default(false),
  isLooseCells: boolean("is_loose_cells").default(false),
  serialFlagReason: varchar("serial_flag_reason", { length: 100 }),
  manufacturerFlagReason: varchar("manufacturer_flag_reason", { length: 100 }),
  cellModelFlagReason: varchar("cell_model_flag_reason", { length: 100 }),
  voltageFlagReason: varchar("voltage_flag_reason", { length: 100 }),
  manufacturerCorrectionConfidence: varchar("manufacturer_correction_confidence", { length: 10 }),
  cellModelCorrectionConfidence: varchar("cell_model_correction_confidence", { length: 10 }),
  voltageCorrectionConfidence: varchar("voltage_correction_confidence", { length: 10 }),
  rowPhoto: text("row_photo"),
  adminNotes: text("admin_notes"),
  resolvedById: integer("resolved_by_id").references(() => usersTable.id),
  resolvedAt: timestamp("resolved_at"),
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

export const batteryWeightReferenceTable = pgTable("battery_weight_reference", {
  id: serial("id").primaryKey(),
  cellType: varchar("cell_type", { length: 50 }).notNull(),
  voltage: varchar("voltage", { length: 50 }),
  weightKg: decimal("weight_kg", { precision: 10, scale: 3 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type BatteryWeightReference = typeof batteryWeightReferenceTable.$inferSelect;

export const cellModelsTable = pgTable("cell_models", {
  id: serial("id").primaryKey(),
  manufacturer: varchar("manufacturer", { length: 100 }).notNull().default("Unknown"),
  modelName: varchar("model_name", { length: 100 }).notNull(),
  cellFamily: varchar("cell_family", { length: 50 }).notNull(),
  cellHeightMm: integer("cell_height_mm").notNull(),
  cellsCount: integer("cells_count").notNull(),
  weightPerCellKg: decimal("weight_per_cell_kg", { precision: 10, scale: 3 }).notNull(),
  pbContentKgPerCell: decimal("pb_content_kg_per_cell", { precision: 10, scale: 3 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_cell_models_mfr_model").on(table.manufacturer, table.modelName),
  index("idx_cell_models_family").on(table.cellFamily),
  index("idx_cell_models_family_height").on(table.cellFamily, table.cellHeightMm),
  index("idx_cell_models_manufacturer").on(table.manufacturer),
]);

export type CellModel = typeof cellModelsTable.$inferSelect;
export type InsertCellModel = typeof cellModelsTable.$inferInsert;

export const jobDraftsTable = pgTable("job_drafts", {
  id: serial("id").primaryKey(),
  savedById: integer("saved_by_id").notNull().references(() => usersTable.id),
  depot: varchar("depot", { length: 255 }).notNull(),
  clientId: integer("client_id").references(() => clientsTable.id),
  locationId: integer("location_id").references(() => locationsTable.id),
  formData: jsonb("form_data").notNull(),
  collectionPoint: varchar("collection_point", { length: 255 }),
  batteryCount: integer("battery_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, (table) => [
  index("idx_job_drafts_saved_by").on(table.savedById),
  index("idx_job_drafts_depot_client").on(table.depot, table.clientId),
  index("idx_job_drafts_client").on(table.clientId),
]);

export type JobDraft = typeof jobDraftsTable.$inferSelect;
