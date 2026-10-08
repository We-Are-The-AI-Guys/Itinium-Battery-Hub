import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { db } from "@workspace/db";
import { clientsTable, locationsTable, usersTable, stillageMovementsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";
import stillagesRouter from "../stillages";

const auth = vi.hoisted(() => ({
  user: { id: 0, role: "head_office_admin", clientId: null as number | null,
    locationId: null as number | null, permittedLocationIds: [] as number[] },
}));
vi.mock("../../middlewares/auth", () => ({
  requireAuth: (req: any, _res: any, next: () => void) => { req.user = auth.user; next(); },
}));

// Explicit development-only integration run; never uses production connectors.
const enabled = process.env.RUN_DB_ACCESS_TESTS === "1" && process.env.NODE_ENV !== "production";
describe.skipIf(!enabled)("stillage canonical ownership integration", () => {
  let server: Server | undefined;
  let origin: string;
  const clientIds: number[] = [];
  const locationIds: number[] = [];
  let userId: number;
  beforeAll(async () => {
    const key = randomUUID();
    for (const name of ["A", "B"]) {
      const [client] = await db.insert(clientsTable).values({ name: `Stillage regression ${name} ${key}` }).returning();
      clientIds.push(client.id);
    }
    for (const [clientId, name] of [[clientIds[0], "Default"], [clientIds[0], "Other permitted"], [clientIds[1], "Default"]] as const) {
      const [location] = await db.insert(locationsTable).values({ clientId, name }).returning();
      locationIds.push(location.id);
    }
    const [user] = await db.insert(usersTable).values({
      email: `stillage-${key}@example.invalid`, fullName: "Stillage regression",
      role: "head_office_admin", passwordHash: "not-a-login-hash",
    }).returning();
    userId = user.id;
    auth.user.id = userId;
    const app = express();
    app.use(express.json(), stillagesRouter);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(async () => {
    if (server) await new Promise<void>(resolve => server!.close(() => resolve()));
    if (userId) {
      await db.delete(stillageMovementsTable).where(eq(stillageMovementsTable.createdById, userId));
      await db.delete(usersTable).where(eq(usersTable.id, userId));
    }
    if (locationIds.length) await db.delete(locationsTable).where(inArray(locationsTable.id, locationIds));
    if (clientIds.length) await db.delete(clientsTable).where(inArray(clientsTable.id, clientIds));
  });
  const post = (locationId: number, extra = {}) => fetch(`${origin}/stillages`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locationId, movementDate: "2026-10-08", collected: 3, droppedOff: 0, ...extra }),
  });
  const principal = (role: string, ids = locationIds.slice(0, 2)) => {
    auth.user = { id: userId, role, clientId: clientIds[0], locationId: locationIds[0], permittedLocationIds: ids };
  };
  it.each(["head_office_admin", "accounts"])("links %s movements so depot users can see them", async role => {
    principal(role);
    const res = await post(locationIds[1], { depot: "Spoofed name", clientId: clientIds[1] });
    expect(res.status).toBe(201);
    const { movement } = await res.json() as { movement: { id: number } };
    expect(movement).toMatchObject({ clientId: clientIds[0], locationId: locationIds[1], depot: "Other permitted" });
    principal("depot_user");
    const list = await (await fetch(`${origin}/stillages`)).json() as { movements: { id: number }[] };
    expect(list.movements.some((row: { id: number }) => row.id === movement.id)).toBe(true);
  });
  it.each(["depot_user", "team_leader"])("%s can choose a non-default permitted site", async role => {
    principal(role);
    expect((await post(locationIds[1])).status).toBe(201);
    expect(auth.user.locationId).toBe(locationIds[0]);
    const { locations } = await (await fetch(`${origin}/stillages/locations`)).json() as { locations: { id: number }[] };
    expect(locations.map((row: { id: number }) => row.id).sort()).toEqual(locationIds.slice(0, 2).sort());
  });
  it("denies same-client revoked and cross-client sites, with non-leaking lists and totals", async () => {
    principal("depot_user", [locationIds[0]]);
    expect((await post(locationIds[1])).status).toBe(403);
    expect((await post(locationIds[2])).status).toBe(403);
    const list = await (await fetch(`${origin}/stillages`)).json() as { movements: unknown[]; totalInCirculation: number };
    expect(list.movements).toEqual([]);
    expect(list.totalInCirculation).toBe(0);
    const summary = await (await fetch(`${origin}/stillages/summary`)).json() as { summary: unknown[]; totalInCirculation: number };
    expect(summary.summary).toEqual([]);
    expect(summary.totalInCirculation).toBe(0);
  });
});
