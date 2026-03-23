import { pgTable, serial, varchar, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const collectionPointsTable = pgTable("collection_points", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 255 }).notNull().unique(),
  address: varchar("address", { length: 500 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCollectionPointSchema = createInsertSchema(collectionPointsTable).omit({ id: true, createdAt: true });
export type InsertCollectionPoint = z.infer<typeof insertCollectionPointSchema>;
export type CollectionPoint = typeof collectionPointsTable.$inferSelect;
