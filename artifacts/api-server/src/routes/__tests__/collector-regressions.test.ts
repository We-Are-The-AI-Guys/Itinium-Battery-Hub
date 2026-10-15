import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import cookieParser from "cookie-parser";
import { once } from "node:events";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import documentsRouter from "../job-documents";
import jobsRouter from "../jobs";
import usersRouter from "../users";
import authRouter from "../auth";
import { notifyAccountsStatementUploaded, notifyAdminsDocumentsComplete } from "../../lib/notifications";
import { jobsTable, jobDocumentsTable, usersTable, sessionsTable, userLocationsTable, accessAuditTable } from "@workspace/db/schema";

const state = vi.hoisted(() => ({
  reads: [] as any[][], writes: [] as { table: any; rows: any[] }[],
  storedSize: 7, storedType: "application/pdf", file: vi.fn(),
  missingFile: false, Missing: class extends Error {},
}));
vi.mock("@workspace/db", () => ({
  db: {
    select: () => {
      const rows = state.reads.shift() ?? [];
      const q: any = { from: () => q, where: () => q, innerJoin: () => q, orderBy: () => q, limit: () => q,
        then: (resolve: any) => Promise.resolve(rows).then(resolve) };
      return q;
    },
    update: () => ({ set: () => ({ where: async () => {} }) }),
    delete: () => ({ where: async () => {} }),
    execute: async () => ({}),
    insert: (table: any) => ({ values: (values: any) => {
      const rows = Array.isArray(values) ? values : [values];
      state.writes.push({ table, rows });
      const q: any = { onConflictDoUpdate: () => q, returning: async () => rows.map(row => ({ id: 99, ...row })),
        then: (resolve: any) => Promise.resolve().then(resolve) };
      return q;
    } }),
    transaction: async (callback: any) => { const { db } = await import("@workspace/db"); return callback(db); },
  },
}));
vi.mock("../../lib/notifications", () => ({
  notifyAccountsStatementUploaded: vi.fn(async () => {}),
  notifyAdminsDocumentsComplete: vi.fn(async () => {}),
}));
vi.mock("../../lib/email", () => ({ sendEmail: vi.fn(), buildPasswordResetEmail: vi.fn() }));
vi.mock("../../lib/objectStorage", () => ({
  ObjectNotFoundError: state.Missing,
  ObjectStorageService: class {
    getObjectEntityUploadURL = async () => "https://fixture.invalid/upload";
    normalizeObjectEntityPath = () => "/objects/fixture";
    getObjectEntityFile = async (path: string) => { state.file(path); if (state.missingFile) throw new state.Missing(); return { getMetadata: async () => [{ size: state.storedSize, contentType: state.storedType }] }; };
    downloadObject = async () => new Response("fixture document");
  },
}));

let server: Server, origin: string;
const collector = { id: 1, role: "collection_company", roles: ["collection_company"], clientId: null, collectionCompanyId: 10, isActive: true };
const job = { id: 5, reference: "FIXTURE-5", clientName: "Fictional Client", depot: "Fictional Site", collectionCompanyId: 10,
  scheduleStatus: "confirmed", collectionReleasedAt: new Date(), collectionDate: "2020-01-01", status: "received", tonnage: "1.000" };
function signedIn(user: any = collector) {
  state.reads.push([{ token: "fixture-session", userId: user.id, expiresAt: new Date(Date.now() + 60000) }], [user]);
  if (user.clientId) state.reads.push([{ id: 11 }]);
}
const request = (path: string, body?: any) => fetch(origin + path, {
  method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", Cookie: "session_token=fixture-session" },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
beforeAll(async () => {
  vi.stubEnv("SESSION_SECRET", "isolated-fixture-signing-key");
  const app = express(); app.use(express.json(), cookieParser());
  app.use("/api", documentsRouter, jobsRouter, usersRouter, authRouter);
  server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(async () => { vi.unstubAllEnvs(); await new Promise<void>(resolve => server.close(() => resolve())); });
beforeEach(() => {
  state.reads = []; state.writes = []; state.file.mockClear(); state.storedSize = 7; state.storedType = "application/pdf";
  state.missingFile = false;
  vi.mocked(notifyAccountsStatementUploaded).mockClear(); vi.mocked(notifyAdminsDocumentsComplete).mockClear();
});
describe("authenticated collector document workflow", () => {
  it("treats missing backing files as missing rather than advertising broken links", async () => {
    state.missingFile = true;
    signedIn(); state.reads.push([job], [{ docType: "statement", objectPath: "/objects/missing", fileName: "missing.pdf" }]);
    const response = await request("/jobs/5/documents");
    expect(await response.json()).toMatchObject({ documents: [], outstandingTypes: ["collection_sheet", "consignment_note", "statement"] });
    signedIn(); state.reads.push([job], [{ docType: "statement", objectPath: "/objects/missing", fileName: "missing.pdf" }]);
    expect((await request("/jobs/5/documents/statement/download")).status).toBe(404);
  });
  it.each(["head_office_admin", "collection_company"].flatMap(role =>
    ["request", "confirmed", "received", "processing", "awaiting_invoice", "invoice", "completed", "cancelled"].flatMap(status =>
      ["collection_sheet", "consignment_note", "statement"].map(docType => ({ role, status, docType })))
  ))("uploads and downloads $docType for $role at $status", async ({ role, status, docType }) => {
    const user = { ...collector, role, roles: [role] };
    const currentJob = { ...job, status, collectionDate: null, collectionReleasedAt: null, scheduleStatus: "unassigned" };
    const meta = { docType, name: "fictional.pdf", size: 7, contentType: "application/pdf" };
    signedIn(user); state.reads.push([currentJob]);
    const response = await request("/collection/jobs/5/documents/upload-url", meta);
    expect(response.status).toBe(200);
    const intent = await response.json() as any;
    signedIn(user); state.reads.push([currentJob], [], []);
    expect((await request("/collection/jobs/5/documents", { ...meta, ...intent })).status).toBe(201);
    signedIn(user); state.reads.push([currentJob], [{ ...meta, objectPath: intent.objectPath, fileName: meta.name }]);
    expect((await request(`/jobs/5/documents/${docType}/download`)).status).toBe(200);
  });
  it("records replacement history without modifying the other two types", async () => {
    const meta = { docType: "statement", name: "new.pdf", size: 7, contentType: "application/pdf" };
    signedIn(); state.reads.push([job]);
    const intent = await (await request("/collection/jobs/5/documents/upload-url", meta)).json() as any;
    const previous = { docType: "statement", objectPath: "/objects/old", fileName: "old.pdf", uploadedById: 44, uploadedAt: "2026-10-01" };
    signedIn(); state.reads.push([job], ["collection_sheet", "consignment_note", "statement"].map(docType => ({ docType })), [previous]);
    expect((await request("/collection/jobs/5/documents", { ...meta, ...intent })).status).toBe(201);
    expect(state.writes.filter(w => w.table === jobDocumentsTable)).toHaveLength(1);
    expect(state.writes.find(w => w.table === accessAuditTable)?.rows[0]).toMatchObject({ actorId: 1, action: "document.replace", details: { previous: [previous] } });
    signedIn(); state.reads.push([job], [{ docType: "statement", objectPath: "/objects/fixture", fileName: "new.pdf", uploadedById: 1 }],
      [{ id: 80, actorId: 1, createdAt: new Date(), details: { docType: "statement", previous: [previous] } }]);
    const history = await request("/jobs/5/documents/statement/history");
    expect(history.status).toBe(200);
    const data = await history.json() as any;
    expect(data.versions).toHaveLength(2);
    expect(data.versions[1]).toMatchObject({ fileName: "old.pdf", replacedById: 1, version: 1 });
    expect(JSON.stringify(data)).not.toContain("/objects/");
    signedIn(); state.reads.push([job], [{ docType: "statement", objectPath: "/objects/fixture", fileName: "new.pdf" }],
      [{ id: 80, actorId: 1, createdAt: new Date(), details: { docType: "statement", previous: [{ ...previous, contentType: "application/pdf" }] } }]);
    expect((await request("/jobs/5/documents/statement/history/80/download")).status).toBe(200);
    expect(state.file).toHaveBeenLastCalledWith("/objects/old");
  });
  it.each(["collection_sheet", "consignment_note", "statement"])("authorises and records %s with a bound intent", async docType => {
    const meta = { docType, name: "fictional.pdf", size: 7, contentType: "application/pdf" };
    signedIn(); state.reads.push([job]);
    const upload = await request("/collection/jobs/5/documents/upload-url", meta);
    expect(upload.status).toBe(200);
    const intent = await upload.json() as { objectPath: string; uploadToken: string };
    signedIn(); state.reads.push([job], [{ docType: "collection_sheet" }, { docType: "consignment_note" }], []);
    const saved = await request("/collection/jobs/5/documents", { ...meta, objectPath: intent.objectPath, uploadToken: intent.uploadToken });
    expect(saved.status).toBe(201);
    expect(state.writes.find(w => w.table === jobDocumentsTable)?.rows[0]).toMatchObject({ docType, uploadedById: 1 });
    expect(notifyAccountsStatementUploaded).toHaveBeenCalledTimes(docType === "statement" ? 1 : 0);
    expect(notifyAdminsDocumentsComplete).toHaveBeenCalledTimes(docType === "statement" ? 1 : 0);
  });
  it("does not duplicate notifications on a replay", async () => {
    const meta = { docType: "statement", name: "fictional.pdf", size: 7, contentType: "application/pdf" };
    signedIn(); state.reads.push([job]);
    const intent = await (await request("/collection/jobs/5/documents/upload-url", meta)).json() as { objectPath: string; uploadToken: string };
    signedIn(); state.reads.push([job], ["collection_sheet", "consignment_note", "statement"].map(docType => ({ docType })), [{ objectPath: intent.objectPath }]);
    expect((await request("/collection/jobs/5/documents", { ...meta, ...intent })).status).toBe(201);
    expect(notifyAccountsStatementUploaded).not.toHaveBeenCalled();
    expect(notifyAdminsDocumentsComplete).not.toHaveBeenCalled();
  });
  it("shows uploaded metadata and enables assigned collector downloads before Completed", async () => {
    signedIn(); state.reads.push([job], [{ docType: "statement", fileName: "fixture.pdf" }]);
    const res = await request("/jobs/5/documents");
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ documents: [{ docType: "statement" }], requiredTypes: ["collection_sheet", "consignment_note", "statement"], releasePending: false });
    signedIn(); state.reads.push([job], [{ objectPath: "/objects/fixture", fileName: "fictional.pdf", contentType: "application/pdf" }]);
    expect((await request("/jobs/5/documents/collection_sheet/download")).status).toBe(200);
  });
  it.each(["collection_sheet", "consignment_note", "statement"])("allows assigned collector to download %s at Completed", async docType => {
    signedIn(); state.reads.push([{ ...job, status: "completed" }], [{ docType, objectPath: "/objects/fixture", fileName: "fictional.pdf", contentType: "application/pdf" }]);
    expect((await request(`/jobs/5/documents/${docType}/download`)).status).toBe(200);
  });
  it.each([
    { collectionCompanyId: 20 },
  ])("denies uploads to unavailable collection %j", async override => {
    signedIn(); state.reads.push([{ ...job, ...override }]);
    expect((await request("/collection/jobs/5/documents/upload-url", { docType: "statement", name: "fixture.pdf", size: 7, contentType: "application/pdf" })).status).toBe(404);
  });
  it("allows future collection uploads but rejects oversize files", async () => {
    const meta = { docType: "statement", name: "fixture.pdf", size: 7, contentType: "application/pdf" };
    signedIn(); state.reads.push([{ ...job, status: "confirmed", collectionDate: "2099-01-01" }]);
    expect((await request("/collection/jobs/5/documents/upload-url", meta)).status).toBe(200);
    state.reads = []; signedIn();
    expect((await request("/collection/jobs/5/documents/upload-url", { ...meta, size: 21 * 1024 * 1024 })).status).toBe(400);
  });
  it("rejects a forged upload intent before reading storage", async () => {
    signedIn(); state.reads.push([job]);
    expect((await request("/collection/jobs/5/documents", { docType: "statement", name: "fixture.pdf", size: 7, contentType: "application/pdf", objectPath: "/objects/other", uploadToken: "forged" })).status).toBe(400);
    expect(state.file).not.toHaveBeenCalled();
  });
  it.each(["lead_client", "accounts", "team_leader", "depot_user"])("denies customer %s Statement access and uploads", async role => {
    const user = { ...collector, role, roles: [role], clientId: 1, collectionCompanyId: null };
    for (const action of ["view", "download"]) {
      state.reads = []; signedIn(user); state.reads.push([{ ...job, clientId: 1, locationId: 11 }]);
      expect((await request(`/jobs/5/documents/statement/${action}`)).status).toBe(404);
    }
    state.reads = []; signedIn(user);
    expect((await request("/collection/jobs/5/documents/upload-url", { docType: "statement" })).status).toBe(403);
    expect(state.file).not.toHaveBeenCalled();
    expect((await request("/objects/fixture")).status).toBe(404);
  });
  it.each(["lead_client", "accounts", "team_leader", "depot_user"])("enforces Invoice release and tenant scope on signed files for %s", async role => {
    const user = { ...collector, role, roles: [role], clientId: 1, collectionCompanyId: null };
    for (const status of ["request", "confirmed", "received", "awaiting_invoice", "invoice", "invoiced", "completed"]) {
      for (const type of ["collection_sheet", "consignment_note"]) for (const action of ["view", "download"]) {
        state.reads = []; signedIn(user);
        const current = { ...job, clientId: 1, locationId: 11, status };
        state.reads.push([current], [current], [{ docType: type, objectPath: "/objects/fixture", fileName: "signed.pdf", contentType: "application/pdf" }]);
        expect((await request(`/jobs/5/documents/${type}/${action}`)).status).toBe(["invoice", "invoiced", "completed"].includes(status) ? 200 : 403);
      }
    }
    for (const override of [{ clientId: 2 }, ...(["team_leader", "depot_user"].includes(role) ? [{ locationId: 22 }] : [])]) {
      state.reads = []; signedIn(user); state.reads.push([{ ...job, clientId: 1, locationId: 11, status: "invoice", ...override }]);
      state.file.mockClear();
      expect((await request("/jobs/5/documents/collection_sheet/view")).status).toBe(404);
      expect(state.file).not.toHaveBeenCalled();
    }
    state.reads = []; signedIn(user); state.reads.push([{ ...job, clientId: 1, locationId: 11 }]);
    expect((await request("/jobs/5/documents/statement/history")).status).toBe(404);
  });
});
describe("driver sheet HTTP access", () => {
  it("passes the global policy for a released confirmed collection before collection", async () => {
    signedIn(); state.reads.push([{ ...job, status: "confirmed", collectionDate: "2099-01-01" }], []);
    const res = await request("/jobs/5/collection-sheet.pdf");
    expect(res.status).toBe(200); expect(res.headers.get("content-type")).toContain("application/pdf");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(100);
  });
  it.each([{ collectionReleasedAt: null }, { scheduleStatus: "proposed" }, { collectionCompanyId: 20 }, { collectionDate: null }])(
    "denies sheet %j", async override => {
      signedIn(); state.reads.push([{ ...job, ...override }]);
      expect((await request("/jobs/5/collection-sheet.pdf")).status).toBe(403);
    });
  it.each(["lead_client", "accounts", "team_leader", "depot_user"])("denies customer %s at global policy", async role => {
    signedIn({ ...collector, role, roles: [role], clientId: 1 });
    expect((await request("/jobs/5/collection-sheet.pdf")).status).toBe(403);
  });
});
describe("admin creation to sign-in with issued credentials", () => {
  it.each([undefined, "Fictional-Supplied-Password"].flatMap(password =>
    [["depot_user"], ["team_leader", "depot_user"], ["accounts", "depot_user"], ["lead_client", "team_leader"]].map(roles => ({ password, roles }))
  ))("authenticates issued password and combined roles with one client ($roles)", async ({ password, roles }) => {
    signedIn({ ...collector, role: "head_office_admin", roles: ["head_office_admin"] });
    state.reads.push([{ clientId: 1 }], [{ clientId: 1 }], [], [{ name: "Fictional New Site" }]);
    const created = await request("/users", { fullName: "Fictional Warehouse User", email: "  NEW.SITE@EXAMPLE.TEST  ", role: roles[0], roles, clientId: 1, locationId: 11, permittedLocationIds: [], ...(password ? { password } : {}) });
    expect(created.status).toBe(201);
    const issued = await created.json() as { user: { email: string }; tempPassword: string };
    const saved = state.writes.find(w => w.table === usersTable)!.rows[0];
    expect(saved.roles).toEqual(expect.arrayContaining(roles));
    expect(saved.clientId).toBe(1);
    expect(issued.user).toMatchObject({ email: "new.site@example.test", permittedLocationIds: [11], locationId: 11 });
    expect(state.writes.find(w => w.table === userLocationsTable)?.rows).toEqual([{ userId: 99, locationId: 11 }]);
    state.reads = [[{ ...saved, id: 99, isActive: false }]];
    expect((await request("/auth/login", { email: issued.user.email, password: issued.tempPassword })).status).toBe(403);
    state.reads = [[{ ...saved, id: 99 }], [{ name: "Fictional Client" }], [{ name: "Fictional New Site" }], [{ ...saved, id: 99 }], [{ id: 11 }]];
    const login = await request("/auth/login", { email: " NEW.SITE@EXAMPLE.TEST ", password: issued.tempPassword });
    expect(login.status).toBe(200);
    expect(await login.json()).toMatchObject({ user: { roles: expect.arrayContaining(roles), locationName: "Fictional New Site", permittedLocationIds: [11], clientId: 1 } });
    expect(login.headers.get("set-cookie")).toContain("HttpOnly");
    expect(state.writes.some(w => w.table === sessionsTable)).toBe(true);
    const persistedSession = state.writes.filter(w => w.table === sessionsTable).at(-1)!.rows[0];
    state.reads = [[persistedSession], [{ ...saved, id: 99 }], [{ name: "Fictional Client" }], [{ name: "Fictional New Site" }], [{ ...saved, id: 99 }], [{ id: 11 }]];
    const me = await fetch(origin + "/auth/me", { headers: { Cookie: `session_token=${persistedSession.token}` } });
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { permittedLocationIds: [11], locationName: "Fictional New Site" } });
    state.reads = [[{ ...saved, id: 99 }]];
    expect((await request("/auth/login", { email: issued.user.email, password: "Wrong-Fictional-Password" })).status).toBe(401);
  });
});
