import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PgDialect } from "drizzle-orm/pg-core";
import router from "../collection-companies";
import { policyAllows } from "../../lib/access-policy";
const state = vi.hoisted(() => ({ reads: [] as any[][], scopes: [] as any[], changes: [] as any[] }));
vi.mock("@workspace/db", () => ({ db: {
  select: () => {
    const rows = state.reads.shift() ?? [];
    const q = { from: () => q, where: (scope: any) => { state.scopes.push(scope); return q; },
      orderBy: () => q, then: (resolve: any) => Promise.resolve(rows).then(resolve) };
    return q;
  },
  update: () => ({ set: (data: any) => {
    state.changes.push(data);
    return { where: () => {
      const p = Promise.resolve();
      return Object.assign(p, { returning: async () => [{ id: 7, ...data }] });
    } };
  } }),
} }));
vi.mock("../../lib/notifications", () => ({ notifyAdminsScheduleProposed: vi.fn(async () => {}) }));
let server: Server, origin: string;
beforeAll(async () => {
  const app = express(); app.use(express.json()); app.use(cookieParser()); app.use(router);
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => { state.scopes = []; state.changes = []; seed(); });
function seed(role = "collection_company", company: number | null = 5) {
  state.reads = [
    [{ userId: 1, expiresAt: new Date(Date.now() + 60000) }],
    [{ id: 1, isActive: true, role, clientId: null, collectionCompanyId: company }],
  ];
}
const request = (path: string, method = "GET", body?: unknown) => fetch(`${origin}${path}`, {
  method, headers: { Cookie: "session_token=test", "Content-Type": "application/json" },
  body: body ? JSON.stringify(body) : undefined,
});
describe("collector fleet with real authentication and role middleware", () => {
  it("loads own vehicles and drivers even when a foreign company is requested", async () => {
    state.reads.push([{ id: 5, name: "Own company" }], [{ id: 2, registration: "OWN" }], [{ id: 3, name: "Own driver" }]);
    const res = await request("/collection-companies/fleet?companyId=99");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ company: { id: 5 }, vehicles: [{ id: 2 }], drivers: [{ id: 3 }] });
    for (const scope of state.scopes.slice(2)) expect(new PgDialect().sqlToQuery(scope).params).toEqual([5]);
  });
  it.each(["accounts", "team_leader", "depot_user"])("keeps %s out of fleet administration", async role => {
    seed(role);
    expect((await request("/collection-companies/fleet")).status).toBe(403);
  });
  it("denies a collector without a company", async () => {
    seed("collection_company", null);
    expect((await request("/collection-companies/fleet")).status).toBe(403);
  });
  it("allows proposing own driver and vehicle for an assigned job", async () => {
    state.reads.push(
      [{ id: 7, collectionCompanyId: 5, status: "request", scheduleStatus: "unassigned", reference: "TEST" }],
      [{ id: 2, registration: "OWN" }], [{ id: 3, name: "Own driver" }], [{ name: "Own company" }],
    );
    const res = await request("/collection/jobs/7/assign", "POST", { vehicleId: 2, driverId: 3, proposedDate: "2026-10-20" });
    expect(res.status).toBe(200);
    expect(state.changes).toContainEqual(expect.objectContaining({ driverName: "Own driver", vehicleReg: "OWN", scheduleStatus: "proposed" }));
    for (const scope of state.scopes.slice(3, 5)) expect(new PgDialect().sqlToQuery(scope).params).toContain(5);
  });
  it("rejects a different company's job", async () => {
    state.reads.push([{ id: 7, collectionCompanyId: 99, status: "request", scheduleStatus: "unassigned" }]);
    expect((await request("/collection/jobs/7/assign", "POST", { vehicleId: 2, driverId: 3, proposedDate: "2026-10-20" })).status).toBe(404);
    expect(state.changes.some(c => c.scheduleStatus)).toBe(false);
  });
  it("rejects foreign or inactive fleet selections", async () => {
    state.reads.push([{ id: 7, collectionCompanyId: 5, status: "request", scheduleStatus: "unassigned" }], [], []);
    expect((await request("/collection/jobs/7/assign", "POST", { vehicleId: 99, driverId: 99, proposedDate: "2026-10-20" })).status).toBe(400);
    expect(state.changes.some(c => c.scheduleStatus)).toBe(false);
  });
  it("permits only intended fleet operations and not company administration or confirmation", () => {
    const user = { role: "collection_company", clientId: null, collectionCompanyId: 5 };
    for (const type of ["vehicles", "drivers"]) {
      expect(policyAllows(user, "POST", `/collection-companies/${type}`)).toBe(true);
      expect(policyAllows(user, "PATCH", `/collection-companies/${type}/:id`)).toBe(true);
      expect(policyAllows(user, "DELETE", `/collection-companies/${type}/:id`)).toBe(false);
    }
    expect(policyAllows(user, "GET", "/collection-companies")).toBe(false);
    expect(policyAllows(user, "POST", "/collection/schedule/confirm")).toBe(false);
  });
});
