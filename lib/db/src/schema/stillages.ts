import { pgTable, serial, integer, text, timestamp, varchar, date, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const stillageMovementsTable = pgTable("stillage_movements", {
  id: serial("id").primaryKey(),
  depot: varchar("depot", { length: 255 }).notNull(),
  clientId: integer("client_id"),
  locationId: integer("location_id"),
  movementDate: date("movement_date").notNull(),
  collected: integer("collected").notNull().default(0),
  droppedOff: integer("dropped_off").notNull().default(0),
  notes: text("notes"),
  createdById: integer("created_by_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => [
  index("idx_stillage_movements_depot").on(table.depot),
  index("idx_stillage_movements_date").on(table.movementDate),
]);

export const insertStillageMovementSchema = createInsertSchema(stillageMovementsTable).omit({ id: true, createdAt: true });
export type InsertStillageMovement = z.infer<typeof insertStillageMovementSchema>;
export type StillageMovement = typeof stillageMovementsTable.$inferSelect;
