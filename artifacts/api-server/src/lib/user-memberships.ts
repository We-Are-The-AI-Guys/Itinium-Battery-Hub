import { db } from "@workspace/db";
import { locationsTable, userLocationsTable, usersTable } from "@workspace/db/schema";
import { clientWide } from "./access-policy";
import { and, eq } from "drizzle-orm";

export async function userLocationIds(userId: number, clientId: number | null): Promise<number[]> {
  if (!clientId) return [];
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (user && clientWide(user)) {
    return (await db.select({ id: locationsTable.id }).from(locationsTable).where(eq(locationsTable.clientId, clientId))).map(row => row.id);
  }
  const rows = await db.select({ id: locationsTable.id }).from(userLocationsTable)
    .innerJoin(locationsTable, eq(locationsTable.id, userLocationsTable.locationId))
    .where(and(eq(userLocationsTable.userId, userId), eq(locationsTable.clientId, clientId)));
  return rows.map(row => row.id);
}
