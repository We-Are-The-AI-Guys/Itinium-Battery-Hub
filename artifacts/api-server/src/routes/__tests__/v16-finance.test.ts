import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PgDialect } from "drizzle-orm/pg-core";
import router from "../jobs";
const state = vi.hoisted(() => ({
  role: "accounts", roles: ["accounts"], clientId: 1 as number | null,
  rows: [] as any[][], scopes: [] as any[],
}));
vi.mock("@workspace/db", () => ({ db: {
  select: () => {
    const result = state.rows.shift() ?? [];
    const q = { from: () => q, where: (scope: any) => { state.scopes.push(scope); return q; },
      then: (resolve: any) => Promise.resolve(result).then(resolve) };
    return q;
  },
} }));
vi.mock("../../middlewares/auth", async () => {
  const actual = await vi.importActual<any>("../../middlewares/auth");
  return { ...actual, requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 1, role: state.role, roles: state.roles, clientId: state.clientId, permittedLocationIds: [10] }; next();
  } };
});
let server: Server, origin: string;
beforeAll(async () => {
  const app = express(); app.use(router);
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => { state.role = "accounts"; state.roles = ["accounts"]; state.clientId = 1; state.rows = []; state.scopes = []; });
describe("V16 dashboard finance", () => {
  it.each(["accounts", "lead_client"])("%s gets only invoice total and client-scoped operations", async role => {
    state.role = role; state.roles = [role];
    state.rows = [[{ pendingJobs: 2, monthlyTonnage: "4" }], [{ total: "125" }]];
    const res = await fetch(`${origin}/dashboard/stats?clientId=999&status=completed`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pendingJobs: 2, monthlyTonnage: 4, totalInvoiceValue: 125 });
    const queries = state.scopes.map(s => new PgDialect().sqlToQuery(s));
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(query.sql).toContain('"jobs"."client_id"');
      expect(query.params).toContain(1);
      expect(query.params).toContain("completed");
    }
    expect(queries[1].params).toEqual(expect.arrayContaining(["invoiced", "paid"]));
  });
  it("Team Leader cannot obtain invoice or internal financial amounts", async () => {
    state.role = "team_leader"; state.roles = ["team_leader"];
    state.rows = [[{ pendingJobs: 2, monthlyTonnage: "4" }]];
    const res = await fetch(`${origin}/dashboard/stats`);
    expect(await res.json()).toEqual({ pendingJobs: 2, monthlyTonnage: 4 });
    expect(state.scopes).toHaveLength(1);
  });
  it.each(["depot_user", "collection_company"])("%s blocked before reading dashboard data", async role => {
    state.role = role; state.roles = [role];
    expect((await fetch(`${origin}/dashboard/stats`)).status).toBe(403);
    expect(state.scopes).toHaveLength(0);
  });
  it("unassigned legacy Accounts denied", async () => {
    state.clientId = null;
    expect((await fetch(`${origin}/dashboard/stats`)).status).toBe(403);
  });
});
