import { pgTable, serial, integer, text, timestamp, varchar, boolean, jsonb, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { clientsTable } from "./clients";
import { locationsTable } from "./locations";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  fullName: varchar("full_name", { length: 255 }).notNull(),
  role: varchar("role", { length: 50 }).notNull().default("depot_user"),
  depot: varchar("depot", { length: 255 }),
  clientId: integer("client_id").references(() => clientsTable.id),
  locationId: integer("location_id").references(() => locationsTable.id),
  isActive: boolean("is_active").notNull().default(true),
  lastActiveAt: timestamp("last_active_at"),
  notificationPreferences: jsonb("notification_preferences").default({
    newJobSubmitted: true,
    jobApprovedCompleted: true,
    invoiceGenerated: true,
    lmePriceAlerts: false,
    weeklySummary: true,
  }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const sessionsTable = pgTable("sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id).notNull(),
  token: text("token").notNull().unique(),
  userAgent: text("user_agent"),
  ipAddress: varchar("ip_address", { length: 45 }),
  lastUsedAt: timestamp("last_used_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const systemSettingsTable = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  singletonKey: varchar("singleton_key", { length: 10 }).notNull().default("default").unique(),
  companyName: varchar("company_name", { length: 255 }).notNull().default("Itinium Ltd"),
  invoicePrefix: varchar("invoice_prefix", { length: 20 }).notNull().default("INV"),
  dataRetentionDays: integer("data_retention_days").notNull().default(365),
  autoFetchLme: boolean("auto_fetch_lme").notNull().default(false),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const passwordResetTokensTable = pgTable("password_reset_tokens", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, passwordHash: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
export type Session = typeof sessionsTable.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;