import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import usersRouter from "../users";
import jobsRouter from "../jobs";

const state = vi.hoisted(() => ({
  reads: [] as unknown[][], updates: {} as Record<string, unknown>,
  inserts: [] as Record<string, unknown>[],
  user: { id: 1, role: "head_office_admin", clientId: 10 as number | null, locationId: 11 as number | null, permittedLocationIds: [11, 12] },
}));
vi.mock("@workspace/db", () => ({
  db: {
    select: () => {
      const rows = state.reads.shift() || [];
      const query = { from: () => query, innerJoin: () => query, where: () => query, orderBy: () => query, limit: () => query, then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows).then(resolve) };
      return query;
    },
    update: () => ({ set: (updates: Record<string, unknown>) => {
      state.updates = updates;
      return { where: () => ({ returning: async () => [{ id: 2, ...updates }] }) };
    } }),
    delete: () => ({ where: async () => {} }),
    execute: async () => ({ rows: [{ max_seq: 0 }] }),
    transaction: async (callback: (tx: unknown) => unknown) => {
      const { db } = await import("@workspace/db");
      return callback(db);
    },
    insert: () => ({ values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
      const rows = Array.isArray(values) ? values : [values];
      state.inserts.push(...rows);
      return { returning: async () => rows.map((row, i) => ({ id: i + 99, ...row })) };
    } }),
  },
}));
vi.mock("../../lib/notifications", () => ({
  notifyAdminsNewJob: vi.fn(async () => {}),
  notifyAdminsFlaggedBatteries: vi.fn(async () => {}),
}));
vi.mock("../../middlewares/auth", async () => {
  const actual = await vi.importActual<typeof import("../../middlewares/auth")>("../../middlewares/auth");
  return { ...actual, requireAuth: (req: any, _res: any, next: () => void) => { req.user = state.user; next(); } };
});

let server: Server;
let origin: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", usersRouter, jobsRouter);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
beforeEach(() => {
  state.reads = []; state.updates = {}; state.inserts = [];
  state.user = { id: 1, role: "head_office_admin", clientId: 10, locationId: 11, permittedLocationIds: [11, 12] };
});
const request = (path: string, body: unknown, method = "PATCH") =>
  fetch(`${origin}${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("default location assignment", () => {
  it("assigns a same-client default", async () => {
    state.reads = [[{ clientId: 10, locationId: null }], [], [{ clientId: 10 }], [{ clientId: 10, locationId: null }], [{ clientId: 10, name: "Site B" }]];
    expect((await request("/users/2", { locationId: 12, permittedLocationIds: [12] })).status).toBe(200);
    expect(state.updates).toMatchObject({ locationId: 12, depot: "Site B" });
  });
  it("rejects a default from another client", async () => {
    state.reads = [[{ clientId: 10, locationId: 11 }], [], [{ clientId: 20, name: "Foreign site" }]];
    expect((await request("/users/2", { locationId: 22, permittedLocationIds: [22] })).status).toBe(403);
    expect(state.updates).toEqual({});
  });
  it("clears the old default when client changes without a replacement", async () => {
    state.reads = [[{ clientId: 10, locationId: 11 }], [{ id: 11 }], [{ clientId: 10, locationId: 11 }]];
    expect((await request("/users/2", { clientId: 20 })).status).toBe(200);
    expect(state.updates).toMatchObject({ clientId: 20, locationId: null, depot: null });
  });
  it("rejects a location without a client", async () => {
    state.reads = [[{ clientId: 10, locationId: 11 }], [{ id: 11 }]];
    expect((await request("/users/2", { clientId: null, locationId: 11 })).status).toBe(400);
  });
});

describe("job location isolation", () => {
  beforeEach(() => { state.user.role = "depot_user"; });
  it.each([false, true])("persists alternate site snapshots without changing the user's default (overrides: %s)", async (overrides) => {
    state.reads = [
      [{ name: "Own client" }],
      [{ name: "Site B", clientId: 10, address: "Site B address", siteContacts: "Site B contact", siteHours: "08:00–16:00", specialInstructions: "Gate B" }],
      [{ manufacturer: "TAB", modelName: "3PzS375", weightPerCellKg: "16.2", pbContentKgPerCell: "16.2", cellsCount: 3 }],
      [],
    ];
    const res = await request("/jobs", {
      locationId: 12,
      ...(overrides ? { collectionPoint: "Temporary entrance B", siteContacts: "One-off contact", siteHours: "", specialInstructions: "One-off instruction" } : {}),
      batteries: [{ palletNumber: "1", batterySerial: "TEST-SERIAL", manufacture: "TAB", cellType: "3PzS375", voltage: "24V" }],
    }, "POST");
    expect(res.status).toBe(201);
    expect(state.inserts[0]).toMatchObject({
      clientId: 10, locationId: 12, depot: "Site B",
      collectionPoint: overrides ? "Temporary entrance B" : "Site B address",
      siteContacts: overrides ? "One-off contact" : "Site B contact",
      siteHours: overrides ? null : "08:00–16:00",
      specialInstructions: overrides ? "One-off instruction" : "Gate B",
    });
    expect(state.user.locationId).toBe(11);
    expect(state.updates).toEqual({});
  });
  it("rejects a foreign client location before creating a job", async () => {
    state.reads = [[{ name: "Own client" }], [{ name: "Foreign site", clientId: 20 }]];
    const res = await request("/jobs", { locationId: 22 }, "POST");
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ message: "This location is not assigned to your account" });
  });
  it("does not replace an explicitly cleared selection with the saved default", async () => {
    expect((await request("/jobs", { locationId: null }, "POST")).status).toBe(400);
  });
  it("rejects a deleted location", async () => {
    state.reads = [[{ name: "Own client" }], []];
    expect((await request("/jobs", { locationId: 12 }, "POST")).status).toBe(400);
  });
  it("requires an assigned client even when a location is supplied", async () => {
    state.user.clientId = null;
    expect((await request("/jobs", { locationId: 22 }, "POST")).status).toBe(403);
  });
});
