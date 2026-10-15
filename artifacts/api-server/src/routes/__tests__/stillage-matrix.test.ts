import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PgDialect } from "drizzle-orm/pg-core";
import router from "../stillages";
const state = vi.hoisted(() => ({ role: "depot_user", roles: ["depot_user"], clientId: 1 as number | null, locations: [11], queries: [] as any[], reads: [] as any[][], updates: [] as any[], audits: [] as any[] }));
vi.mock("@workspace/db", () => ({ db: {
  select: () => {
    const rows = state.reads.shift() ?? [{ depot: "Fixture site", locationId: 11, clientId: 1, totalCollected: 3, totalDroppedOff: 1, notes: "PRIVATE", movementDate: "2026-10-14" }];
    const q: any = { from: () => q, innerJoin: () => q, orderBy: () => q, groupBy: () => q,
      where: (where: any) => { state.queries.push(where); return q; },
      for: () => q, then: (resolve: any) => Promise.resolve(rows).then(resolve) };
    return q;
  },
  update: () => ({ set: (data: any) => { state.updates.push(data); return { where: () => ({ returning: async () => [{ id: 5, ...data }] }) }; } }),
  insert: () => ({ values: async (data: any) => { state.audits.push(data); } }),
  transaction: async (fn: any) => { const { db } = await import("@workspace/db"); return fn(db); },
} }));
vi.mock("../../middlewares/auth", async () => {
  const actual = await vi.importActual<any>("../../middlewares/auth");
  return { ...actual, requireAuth: (req: any, res: any, next: any) => {
    req.user = { id: 1, role: state.role, roles: state.roles, clientId: state.clientId, permittedLocationIds: state.locations };
    next();
  } };
});
let server: Server, origin: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use(router);
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => { state.role = "depot_user"; state.roles = ["depot_user"]; state.clientId = 1; state.locations = [11]; state.queries = []; state.reads = []; state.updates = []; state.audits = []; });
describe("Stillage six-role data boundaries", () => {
  it.each(["lead_client", "accounts", "team_leader", "depot_user"])("returns only read-only scoped aggregates to %s", async role => {
    state.role = role; state.roles = [role];
    const response = await fetch(origin + "/stillages");
    expect(response.status).toBe(200);
    const data = await response.json() as any;
    expect(data).toMatchObject({ scopedTotalInCirculation: 2 });
    expect(data).not.toHaveProperty("movements");
    expect(data).not.toHaveProperty("totalInCirculation");
    expect(JSON.stringify(data)).not.toContain("PRIVATE");
    const query = new PgDialect().sqlToQuery(state.queries[0]);
    expect(query.sql).toContain('"client_id"');
    expect(query.params).toContain(1);
    if (["team_leader", "depot_user"].includes(role)) { expect(query.sql).toContain('"location_id"'); expect(query.params).toContain(11); }
    else expect(query.sql).not.toContain('"location_id"');
    const write = await fetch(origin + "/stillages", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(write.status).toBe(403);
  });
  it("combines customer roles without falling back to the primary Warehouse scope", async () => {
    state.roles = ["depot_user", "accounts"]; state.locations = [];
    const response = await fetch(origin + "/stillages/summary");
    expect(response.status).toBe(200);
    const query = new PgDialect().sqlToQuery(state.queries[0]);
    expect(query.sql).toContain('"client_id"');
    expect(query.sql).not.toContain('"location_id"');
  });
  it("denies Collection Co and does not run a movement query", async () => {
    state.role = "collection_company"; state.roles = ["collection_company"]; state.clientId = null;
    for (const path of ["/stillages", "/stillages/summary", "/stillages/locations"]) expect((await fetch(origin + path)).status).toBe(403);
    expect(state.queries).toHaveLength(0);
  });
  it("returns movement logs and global totals only to Admin", async () => {
    state.role = "head_office_admin"; state.roles = ["head_office_admin"]; state.clientId = null;
    const response = await fetch(origin + "/stillages");
    const data = await response.json() as any;
    expect(data.movements[0].notes).toBe("PRIVATE");
    expect(data.totalInCirculation).toBe(2);
  });
  it("fails closed for an unassigned depot user", async () => {
    state.locations = [];
    await fetch(origin + "/stillages/summary");
    expect(new PgDialect().sqlToQuery(state.queries[0]).sql).toContain("false");
  });
  it("lets only Admin update a movement and audits original notes, actor and changed notes", async () => {
    const send = () => fetch(origin + "/stillages/5", { method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locationId: 11, movementDate: "2026-10-14", collected: 3, droppedOff: 1, notes: "Corrected internal note" }) });
    for (const role of ["lead_client", "accounts", "team_leader", "depot_user", "collection_company"]) {
      state.role = role; state.roles = [role]; expect((await send()).status).toBe(403);
    }
    state.role = "head_office_admin"; state.roles = ["head_office_admin"];
    state.reads = [[{ id: 11, clientId: 1, name: "Fixture site" }], [{ id: 5, notes: "Original private note" }]];
    expect((await send()).status).toBe(200);
    expect(state.updates).toHaveLength(1);
    expect(state.audits[0]).toMatchObject({ actorId: 1, action: "stillage.updated", details: { before: { notes: "Original private note" }, after: { notes: "Corrected internal note" } } });
  });
});
