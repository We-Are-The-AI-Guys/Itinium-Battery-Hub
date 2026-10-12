import { and, eq, inArray, sql, type SQL } from "drizzle-orm";
import { jobsTable } from "@workspace/db/schema";
import { isAdmin, isCustomer, clientWide } from "./access-policy";

export interface DepotPrincipal {
  role: string;
  roles?: string[] | null;
  clientId: number | null;
  permittedLocationIds?: number[];
}

export function isClientUser(user: DepotPrincipal): boolean {
  return isCustomer(user);
}

export function mayAccessDepot(user: DepotPrincipal, record: { clientId: number | null; locationId: number | null }): boolean {
  if (isAdmin(user)) return true;
  return isClientUser(user) && user.clientId != null && record.clientId === user.clientId
    && record.locationId != null && (clientWide(user) || (user.permittedLocationIds ?? []).includes(record.locationId));
}

export function jobScope(user: DepotPrincipal): SQL {
  if (isAdmin(user)) return sql`true`;
  if (isClientUser(user) && user.clientId && clientWide(user)) return eq(jobsTable.clientId, user.clientId);
  if (!isClientUser(user) || !user.clientId || !user.permittedLocationIds?.length) return sql`false`;
  return and(eq(jobsTable.clientId, user.clientId), inArray(jobsTable.locationId, user.permittedLocationIds))!;
}
