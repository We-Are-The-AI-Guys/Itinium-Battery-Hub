import { Router } from "express";
import { Readable } from "node:stream";
import { db } from "@workspace/db";
import { accessAuditTable, jobDocumentsTable, JOB_DOCUMENT_TYPES } from "@workspace/db/schema";
import { and, desc, eq, inArray } from "drizzle-orm";
import { isAdmin, hasRole } from "../lib/access-policy";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";

type JobLoader = (req: AuthenticatedRequest, id: number) => Promise<{ id: number } | null>;
export function documentHistoryRouter(loadJob: JobLoader) {
  const router = Router();
  const storage = new ObjectStorageService();
  async function versions(req: AuthenticatedRequest) {
    if (!isAdmin(req.user!) && !hasRole(req.user!, "collection_company")) return null;
    const type = String(req.params.docType);
    if (!(JOB_DOCUMENT_TYPES as readonly string[]).includes(type)) return null;
    const job = await loadJob(req, Number(req.params.id));
    if (!job) return null;
    const current = await db.select().from(jobDocumentsTable).where(and(eq(jobDocumentsTable.jobId, job.id), eq(jobDocumentsTable.docType, type)));
    const events = await db.select().from(accessAuditTable).where(and(
      eq(accessAuditTable.jobId, job.id), inArray(accessAuditTable.action, ["document.upload", "document.replace"]),
    )).orderBy(desc(accessAuditTable.createdAt), desc(accessAuditTable.id));
    const result: any[] = current.map(doc => ({ ...doc, versionId: "current" }));
    const seen = new Set(result.map(doc => doc.objectPath));
    for (const event of events) {
      const details = event.details as { docType?: string; previous?: any[] } | null;
      if (details?.docType !== type) continue;
      for (const previous of details.previous || []) {
        if (previous.docType !== type || !previous.objectPath || seen.has(previous.objectPath)) continue;
        seen.add(previous.objectPath);
        result.push({ ...previous, versionId: String(event.id), replacedById: event.actorId, replacedAt: event.createdAt });
      }
    }
    return result.map((doc, index) => ({ ...doc, version: result.length - index }));
  }
  router.get("/jobs/:id/documents/:docType/history", requireAuth, requireRole("head_office_admin", "collection_company"), async (req: AuthenticatedRequest, res) => {
    try {
      const items = await versions(req);
      if (!items) { res.status(404).json({ message: "Document history not found" }); return; }
      res.json({ versions: items.map(({ objectPath, ...item }) => item) });
    } catch { res.status(500).json({ message: "Could not load document history" }); }
  });
  router.get("/jobs/:id/documents/:docType/history/:versionId/:action", requireAuth, requireRole("head_office_admin", "collection_company"), async (req: AuthenticatedRequest, res) => {
    try {
      if (!["view", "download"].includes(String(req.params.action))) { res.status(404).end(); return; }
      const items = await versions(req);
      const doc = items?.find(item => item.versionId === String(req.params.versionId));
      if (!doc) { res.status(404).json({ message: "Document version not found" }); return; }
      const response = await storage.downloadObject(await storage.getObjectEntityFile(doc.objectPath));
      res.status(response.status);
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("Content-Type", doc.contentType);
      res.setHeader("Content-Disposition", `${req.params.action === "view" ? "inline" : "attachment"}; filename="${String(doc.fileName).replace(/["\\\r\n]/g, "_")}"`);
      if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res); else res.end();
    } catch (error) {
      res.status(error instanceof ObjectNotFoundError ? 404 : 500).json({ message: "Document version unavailable" });
    }
  });
  return router;
}
