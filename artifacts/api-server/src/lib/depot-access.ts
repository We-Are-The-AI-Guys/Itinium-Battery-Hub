import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { jobsTable } from "@workspace/db/schema";

export interface DepotPrincipal {
  role: string;
  clientId: number | null;
  permittedLocationIds?: number[];
}

export function isClientUser(user: DepotPrincipal): boolean {
  return user.role === "depot_user" || user.role === "team_leader";
}

export function mayAccessDepot(user: DepotPrincipal, record: { clientId: number | null; locationId: number | null }): boolean {
  if (["head_office_admin", "accounts"].includes(user.role)) return true;
  return isClientUser(user) && user.clientId != null && record.clientId === user.clientId
    && record.locationId != null && (user.permittedLocationIds ?? []).includes(record.locationId);
}

export function jobScope(user: DepotPrincipal): SQL {
  if (["head_office_admin", "accounts"].includes(user.role)) return sql`true`;
  if (!isClientUser(user) || !user.clientId || !user.permittedLocationIds?.length) return sql`false`;
  return and(eq(jobsTable.clientId, user.clientId), inArray(jobsTable.locationId, user.permittedLocationIds))!;
}
