import { pgTable, serial, timestamp, varchar, decimal, date, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const lmePricesTable = pgTable("lme_prices", {
  id: serial("id").primaryKey(),
  priceDate: date("price_date").notNull(),
  usdPrice: decimal("usd_price", { precision: 12, scale: 2 }).notNull(),
  exchangeRate: decimal("exchange_rate", { precision: 10, scale: 6 }).notNull(),
  gbpPrice: decimal("gbp_price", { precision: 12, scale: 2 }).notNull(),
  source: varchar("source", { length: 20 }).notNull().default("manual"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  uniqueIndex("idx_lme_prices_price_date").on(table.priceDate),
]);

export const insertLmePriceSchema = createInsertSchema(lmePricesTable).omit({ id: true, createdAt: true });
export type InsertLmePrice = z.infer<typeof insertLmePriceSchema>;
export type LmePrice = typeof lmePricesTable.$inferSelect;
