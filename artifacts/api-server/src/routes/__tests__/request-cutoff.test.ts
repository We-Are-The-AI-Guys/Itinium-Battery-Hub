import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import router from "../access-workflows";
const state = vi.hoisted(() => ({
  role: "accounts", reads: [] as any[][], writes: [] as any[],
}));
vi.mock("@workspace/db", () => {
  const db = {
    select: () => {
      const rows = state.reads.shift() ?? [];
      const q = { from: () => q, where: () => q, for: () => q,
        then: (resolve: any) => Promise.resolve(rows).then(resolve) };
      return q;
    },
    insert: () => ({ values: (data: any) => {
      state.writes.push(data);
      return { returning: async () => [{ id: 101, ...data }] };
    } }),
    update: () => ({ set: (data: any) => ({ where: async () => { state.writes.push(data); } }) }),
    transaction: async (fn: any): Promise<any> => fn(db),
  };
  return { db };
});
vi.mock("../../middlewares/auth", async () => {
  const actual = await vi.importActual<any>("../../middlewares/auth");
  return { ...actual, requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 1, role: state.role, clientId: 1, permittedLocationIds: [10], collectionCompanyId: 3 };
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
beforeEach(() => { state.role = "accounts"; state.reads = []; state.writes = []; });
const job = (status: string) => ({ id: 5, clientId: 1, locationId: 10, collectionCompanyId: 3, status, reference: "TEST" });
const send = (kind: string) => fetch(`${origin}/jobs/5/requests`, { method: "POST",
  headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, notes: "Please change this", outcome: "failed" }) });
describe("collection request cutoff", () => {
  it.each(["received", "invoice", "awaiting_invoice", "completed", "cancelled"])("blocks both request kinds at %s", async status => {
    for (const kind of ["amendment", "cancellation"]) {
      state.reads = [[job(status)], [job(status)]];
      expect((await send(kind)).status).toBe(409);
      expect(state.writes).toHaveLength(0);
    }
  });
  it.each(["request", "confirmed"])("allows customer requests at %s", async status => {
    state.reads = [[job(status)], [job(status)]];
    expect((await send("amendment")).status).toBe(201);
  });
  it("rechecks the locked job if collection occurred after the initial read", async () => {
    state.reads = [[job("confirmed")], [job("received")]];
    expect((await send("cancellation")).status).toBe(409);
    expect(state.writes).toHaveLength(0);
  });
  it("leaves collector exception reports available after receipt", async () => {
    state.role = "collection_company";
    state.reads = [[job("received")], [job("received")]];
    expect((await send("transport_exception")).status).toBe(201);
  });
  it.each(["amendment", "cancellation"])("does not approve a pending %s after receipt", async kind => {
    state.role = "head_office_admin";
    state.reads = [[{ id: 101, jobId: 5, status: "Pending", kind }], [job("received")]];
    expect((await fetch(`${origin}/action-requests/101`, { method: "PATCH",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "Approved", decisionNotes: "Reviewed" }),
    })).status).toBe(409);
    expect(state.writes).toHaveLength(0);
  });
});
