import { db } from "@workspace/db";
import { locationsTable, userLocationsTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";

export async function userLocationIds(userId: number, clientId: number | null): Promise<number[]> {
  if (!clientId) return [];
  const rows = await db.select({ id: locationsTable.id }).from(userLocationsTable)
    .innerJoin(locationsTable, eq(locationsTable.id, userLocationsTable.locationId))
    .where(and(eq(userLocationsTable.userId, userId), eq(locationsTable.clientId, clientId)));
  return rows.map(row => row.id);
}
