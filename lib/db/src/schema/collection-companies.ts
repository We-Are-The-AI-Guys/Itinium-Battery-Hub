import { pgTable, serial, integer, timestamp, varchar, boolean, index } from "drizzle-orm/pg-core";

// Transport / collection companies (e.g. CBL) who carry out the physical
// battery collections. They log into the portal with their own restricted
// role ("collection_company") to assign a vehicle, driver, and proposed
// collection date to jobs.
export const collectionCompaniesTable = pgTable("collection_companies", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const companyVehiclesTable = pgTable("company_vehicles", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => collectionCompaniesTable.id, { onDelete: "cascade" }),
  registration: varchar("registration", { length: 50 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_company_vehicles_company").on(table.companyId),
]);

export const companyDriversTable = pgTable("company_drivers", {
  id: serial("id").primaryKey(),
  companyId: integer("company_id").notNull().references(() => collectionCompaniesTable.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_company_drivers_company").on(table.companyId),
]);

export type CollectionCompany = typeof collectionCompaniesTable.$inferSelect;
export type CompanyVehicle = typeof companyVehiclesTable.$inferSelect;
export type CompanyDriver = typeof companyDriversTable.$inferSelect;
