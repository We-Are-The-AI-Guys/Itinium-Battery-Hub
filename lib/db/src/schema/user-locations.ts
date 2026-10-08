import { pgTable, integer, primaryKey, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { locationsTable } from "./locations";

export const userLocationsTable = pgTable("user_locations", {
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  locationId: integer("location_id").notNull().references(() => locationsTable.id, { onDelete: "cascade" }),
}, table => [primaryKey({ columns: [table.userId, table.locationId] })]);

// Managed by the security bootstrap; retaining the marker is essential:
// schema synchronization must not cause revoked permissions to be re-granted.
export const accessMigrationsTable = pgTable("access_migrations", {
  name: text("name").primaryKey(),
});
