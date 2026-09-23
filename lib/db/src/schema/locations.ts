import { pgTable, serial, integer, text, timestamp, varchar, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";

export const locationsTable = pgTable("locations", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clientsTable.id),
  name: varchar("name", { length: 255 }).notNull(),
  address: varchar("address", { length: 500 }),
  siteContacts: text("site_contacts"),
  siteContactName: varchar("site_contact_name", { length: 255 }),
  siteContactPhone: varchar("site_contact_phone", { length: 100 }),
  siteContact2Name: varchar("site_contact_2_name", { length: 255 }),
  siteContact2Phone: varchar("site_contact_2_phone", { length: 100 }),
  siteContact3Name: varchar("site_contact_3_name", { length: 255 }),
  siteContact3Phone: varchar("site_contact_3_phone", { length: 100 }),
  siteHours: varchar("site_hours", { length: 255 }),
  specialInstructions: text("special_instructions"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_locations_client_id").on(table.clientId),
  uniqueIndex("idx_locations_client_name").on(table.clientId, table.name),
]);

export const insertLocationSchema = createInsertSchema(locationsTable).omit({ id: true, createdAt: true });
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locationsTable.$inferSelect;
