import { pgTable, serial, integer, varchar, text, boolean, timestamp, index } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    jobId: integer("job_id"),
    type: varchar("type", { length: 50 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    link: varchar("link", { length: 500 }),
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("idx_notifications_user_read_created").on(t.userId, t.isRead, t.createdAt),
  ]
);

export type Notification = typeof notificationsTable.$inferSelect;
