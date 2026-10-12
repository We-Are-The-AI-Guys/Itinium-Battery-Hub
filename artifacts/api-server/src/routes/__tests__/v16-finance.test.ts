import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { PgDialect } from "drizzle-orm/pg-core";
import router from "../jobs";
import exportRouter from "../customer-job-export";
import kpiRouter from "../kpi";
import ExcelJS from "exceljs";
const state = vi.hoisted(() => ({
  role: "accounts", roles: ["accounts"], clientId: 1 as number | null,
  rows: [] as any[][], scopes: [] as any[],
}));
vi.mock("@workspace/db", () => ({ db: {
  select: () => {
    const result = state.rows.shift() ?? [];
    const q = { from: () => q, where: (scope: any) => { state.scopes.push(scope); return q; },
      groupBy: () => q, orderBy: () => q,
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
  const app = express(); app.use(router); app.use(exportRouter); app.use(kpiRouter);
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => { state.role = "accounts"; state.roles = ["accounts"]; state.clientId = 1; state.rows = []; state.scopes = []; });
describe("V16 dashboard finance", () => {
  it("includes distinct pallet count on the job detail response", async () => {
    state.rows = [
      [{ id: 12, clientId: 1, locationId: 10, tonnage: "3.125" }],
      [{ id: 1, palletNumber: "P1" }, { id: 2, palletNumber: " p1 " }, { id: 3, palletNumber: "P2" }],
    ];
    const res = await fetch(`${origin}/jobs/12`);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ job: { palletCount: 2 } });
  });
  it.each(["accounts", "head_office_admin"])("%s KPI metrics respect internal visibility", async role => {
    state.role = role; state.roles = [role];
    state.rows = [
      [{ month: "2026-10", jobCount: 2, tonnage: "3", invoiceValue: "100", grossProfit: "20", avgCblLmePct: "65", avgDaysToPay: "10" }],
      [{ month: "2026-10", overdueCount: 1, overdueValue: "10" }],
      [{ status: "completed", count: 2 }],
      [{ avgCblLmePct: "65", avgDaysToPay: "10" }],
    ];
    const res = await fetch(`${origin}/kpi/summary?from=2026-10-06&to=2026-10-12`);
    expect(res.status).toBe(200);
    const body = await res.json() as { totals: Record<string, unknown>; months: Record<string, unknown>[] };
    for (const row of [body.totals, ...body.months]) {
      for (const field of ["grossProfit", "grossMarginPct", "overdueCount", "overdueValue", "avgCblLmePct"]) {
        expect(Object.hasOwn(row, field)).toBe(role === "head_office_admin");
      }
      expect(row.invoiceValue).toBe(100);
    }
    const query = new PgDialect().sqlToQuery(state.scopes[0]);
    expect(query.params).toContainEqual(new Date("2026-10-06T00:00:00Z"));
    expect(query.params).toContainEqual(new Date("2026-10-13T00:00:00Z"));
    if (role === "accounts") expect(query.sql).toContain('"jobs"."client_id"');
  });
  it("rejects invalid custom dates before querying KPI data", async () => {
    expect((await fetch(`${origin}/kpi/summary?from=2026-10-12&to=2026-10-06`)).status).toBe(400);
    expect(state.scopes).toHaveLength(0);
  });
  it.each(["accounts", "lead_client"])("%s can download the customer-only workbook", async role => {
    state.role = role; state.roles = [role];
    state.rows = [[{ id: 12, reference: "JOB-12", tonnage: "3.125", customerTractionPercent: "65",
      customerBlocsTonnage: "0.5", customerTransportCost: "50", customerAdHocCosts: "10",
      customerInvoiceValue: "750", customerInvoiceNo: "000123", netProfit: "secret", wasteInvoiceValue: "secret" }]];
    const res = await fetch(`${origin}/jobs/12/customer-export.xlsx`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("spreadsheetml");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(Buffer.from(await res.arrayBuffer()) as any);
    const sheet = wb.worksheets[0];
    expect(sheet.getRow(1).values).toEqual([undefined, "Job reference", "Tonnage", "% LME Traction (Customer)",
      "Pb Tonnage Blocs", "Transport Costs", "Ad hoc costs", "Net invoice value", "Customer invoice Number"]);
    expect(sheet.getRow(2).values).toEqual([undefined, "JOB-12", 3.125, 65, 0.5, 50, 10, 750, "000123"]);
    const query = new PgDialect().sqlToQuery(state.scopes[0]);
    expect(query.sql).toContain('"jobs"."client_id"');
    expect(query.params).toEqual([12, 1]);
  });
  it.each(["team_leader", "depot_user", "collection_company"])("%s cannot export financial data", async role => {
    state.role = role; state.roles = [role];
    expect((await fetch(`${origin}/jobs/12/customer-export.xlsx`)).status).toBe(403);
    expect(state.scopes).toHaveLength(0);
  });
  it("returns no workbook when the job is outside the permitted scope", async () => {
    expect((await fetch(`${origin}/jobs/12/customer-export.xlsx`)).status).toBe(404);
  });
  it("denies export for Accounts without a client", async () => {
    state.clientId = null;
    expect((await fetch(`${origin}/jobs/12/customer-export.xlsx`)).status).toBe(403);
  });
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
