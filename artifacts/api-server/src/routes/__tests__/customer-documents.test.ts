import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import express from "express";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import router from "../job-documents";

const state = vi.hoisted(() => ({
  role: "depot_user", clientId: 1, permittedLocationIds: [10],
  reads: [] as unknown[][],
  download: vi.fn(async () => new Response("signed document")),
}));
vi.mock("@workspace/db", () => ({
  db: { select: () => {
    const rows = state.reads.shift() ?? [];
    const query = { from: () => query, where: () => query, innerJoin: () => query,
      orderBy: () => query, then: (resolve: any) => Promise.resolve(rows).then(resolve) };
    return query;
  } },
}));
vi.mock("../../middlewares/auth", async () => {
  const actual = await vi.importActual<any>("../../middlewares/auth");
  return { ...actual, requireAuth: (req: any, _res: any, next: any) => {
    req.user = { role: state.role, clientId: state.clientId, permittedLocationIds: state.permittedLocationIds };
    next();
  } };
});
vi.mock("../../lib/objectStorage", () => ({
  ObjectNotFoundError: class extends Error {},
  ObjectStorageService: class {
    getObjectEntityFile = async () => ({});
    downloadObject = state.download;
  },
}));
let server: Server;
let origin: string;
beforeAll(async () => {
  const app = express();
  app.use(router);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>(resolve => server.close(() => resolve())));
beforeEach(() => {
  state.role = "depot_user"; state.clientId = 1; state.permittedLocationIds = [10];
  state.reads = []; state.download.mockClear();
});
describe.each(["depot_user", "team_leader"])("%s document access", role => {
  it("holds signed files until Completed", async () => {
    state.role = role;
    state.reads = [[{ id: 5, clientId: 1, locationId: 10, status: "received" }]];
    expect((await fetch(`${origin}/jobs/5/documents/collection_sheet/download`)).status).toBe(403);
    expect(state.download).not.toHaveBeenCalled();
  });
  it.each(["collection_sheet", "consignment_note"])("downloads permitted %s", async type => {
    state.role = role;
    state.reads = [[{ id: 5, clientId: 1, locationId: 10, status: "completed" }],
      [{ objectPath: "/objects/test", fileName: "signed.pdf", contentType: "application/pdf" }]];
    const res = await fetch(`${origin}/jobs/5/documents/${type}/download`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("signed document");
  });
  it.each(["view", "download"])("blocks statement %s before touching storage", async action => {
    state.role = role;
    expect((await fetch(`${origin}/jobs/5/documents/statement/${action}`)).status).toBe(404);
    expect(state.download).not.toHaveBeenCalled();
  });
  it.each([{ clientId: 2, locationId: 10 }, { clientId: 1, locationId: 11 }, { clientId: 1, locationId: null }])(
    "denies foreign or unassigned job %j", async ownership => {
      state.role = role;
      state.reads = [[{ id: 5, ...ownership }]];
      expect((await fetch(`${origin}/jobs/5/documents/collection_sheet/download`)).status).toBe(404);
      expect(state.download).not.toHaveBeenCalled();
    });
  it("exposes only the two customer document requirements", async () => {
    state.role = role;
    state.reads = [[{ id: 5, clientId: 1, locationId: 10 }], []];
    const res = await fetch(`${origin}/jobs/5/documents`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      documents: [], requiredTypes: ["collection_sheet", "consignment_note"],
      outstandingTypes: ["collection_sheet", "consignment_note"], canUpload: false, releasePending: true,
    });
  });
});
