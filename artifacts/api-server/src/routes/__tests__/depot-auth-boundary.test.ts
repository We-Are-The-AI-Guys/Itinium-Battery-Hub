import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { requireAuth } from "../../middlewares/auth";

const state = vi.hoisted(() => ({
  reads: [] as unknown[][],
}));
vi.mock("@workspace/db", () => ({
  db: {
    select: () => {
      const rows = state.reads.shift() ?? [];
      const query = {
        from: () => query, where: () => query, innerJoin: () => query,
        then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      };
      return query;
    },
    update: () => ({ set: () => ({ where: () => Promise.resolve() }) }),
  },
}));

let server: Server;
let origin: string;
beforeAll(async () => {
  const app = express();
  app.use(cookieParser());
  app.get("/jobs/:id", requireAuth, (_req, res) => res.json({ visible: true }));
  app.get("/jobs/:id/collection-sheet.pdf", requireAuth, (_req, res) => res.json({ visible: true }));
  app.patch("/jobs/:id/batteries/:batteryId/admin", requireAuth, (_req, res) => res.json({ updated: true }));
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
function seed(locationId: number | null = 10, clientId: number | null = 1, memberships = [10]) {
  state.reads = [
    [{ userId: 5, expiresAt: new Date(Date.now() + 60000) }],
    [{ id: 5, isActive: true, role: "team_leader", clientId: 1, locationId: 10 }],
    memberships.map(id => ({ id })),
    [{ id: 100, clientId, locationId }],
  ];
}
beforeEach(() => seed());
const request = (path: string, method = "GET") =>
  fetch(`${origin}${path}`, { method, headers: { Cookie: "session_token=test-session" } });

describe("real authentication middleware depot boundary", () => {
  it("allows an explicitly assigned location", async () => {
    expect((await request("/jobs/100")).status).toBe(200);
  });
  it("allows another explicitly assigned location without changing the default", async () => {
    seed(11, 1, [10, 11]);
    expect((await request("/jobs/100")).status).toBe(200);
  });
  it.each(["/jobs/100", "/JOBS/100", "/jobs/%31%30%30", "/jobs/100/collection-sheet.pdf"])("denies a same-client foreign depot at %s", async path => {
    seed(11);
    expect((await request(path)).status).toBe(404);
  });
  it.each(["/jobs/100junk", "/jobs/1e2", "/jobs/1e100", "/jobs/100.5", "/jobs/-1"])("rejects malformed job identifiers at %s", async path => {
    expect((await request(path)).status).toBe(404);
  });
  it("denies cross-client ownership even with a matching location", async () => {
    seed(10, 2);
    expect((await request("/jobs/100")).status).toBe(404);
  });
  it("denies unlinked historical ownership", async () => {
    seed(null);
    expect((await request("/jobs/100")).status).toBe(404);
  });
  it("rechecks memberships for an unchanged session after revocation", async () => {
    expect((await request("/jobs/100")).status).toBe(200);
    seed(10, 1, []);
    expect((await request("/jobs/100")).status).toBe(404);
  });
  it("rejects a foreign nested battery", async () => {
    state.reads.push([]);
    expect((await request("/jobs/100/batteries/999/admin", "PATCH")).status).toBe(404);
  });
  it("allows an owned nested battery", async () => {
    state.reads.push([{ id: 99 }]);
    expect((await request("/jobs/100/batteries/99/admin", "PATCH")).status).toBe(200);
  });
});
