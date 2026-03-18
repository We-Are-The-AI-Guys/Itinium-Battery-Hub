import { pgTable, serial, integer, text, timestamp, varchar, decimal, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const jobsTable = pgTable("jobs", {
  id: serial("id").primaryKey(),
  reference: varchar("reference", { length: 50 }).notNull().unique(),
  clientName: varchar("client_name", { length: 255 }).notNull(),
  depot: varchar("depot", { length: 255 }).notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  tonnage: decimal("tonnage", { precision: 10, scale: 3 }).notNull(),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  palletNumber: varchar("pallet_number", { length: 100 }),
  assetNumber: varchar("asset_number", { length: 100 }),
  batterySerial: varchar("battery_serial", { length: 100 }),
  cellType: varchar("cell_type", { length: 100 }),
  voltage: varchar("voltage", { length: 50 }),
  weight: decimal("weight", { precision: 10, scale: 2 }),
  condition: varchar("condition", { length: 50 }),
  notes: text("notes"),
  invoiceStatus: varchar("invoice_status", { length: 50 }).default("pending_invoice"),
  lmeRateUsed: decimal("lme_rate_used", { precision: 12, scale: 2 }),
  calculatedValue: decimal("calculated_value", { precision: 12, scale: 2 }),
  submittedById: integer("submitted_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_jobs_status").on(table.status),
  index("idx_jobs_submitted_at").on(table.submittedAt),
  index("idx_jobs_status_submitted_at").on(table.status, table.submittedAt),
]);

export const insertJobSchema = createInsertSchema(jobsTable).omit({ id: true, createdAt: true });
export type InsertJob = z.infer<typeof insertJobSchema>;
export type Job = typeof jobsTable.$inferSelect;
