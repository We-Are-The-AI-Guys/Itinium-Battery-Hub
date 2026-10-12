import { Router } from "express";
import { Readable } from "node:stream";
import { db } from "@workspace/db";
import { actionRequestsTable, exceptionEvidenceTable as evidence, accessAuditTable } from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { accessibleJob } from "./access-workflows";
import { signUploadIntent, verifyUploadIntent } from "./job-documents";
import { ObjectStorageService } from "../lib/objectStorage";
import { z } from "zod";
const router = Router();
const storage = new ObjectStorageService();
const schema = z.object({ name: z.string().min(1).max(255), size: z.number().int().positive().max(20 * 1024 * 1024),
  contentType: z.enum(["application/pdf", "image/jpeg", "image/png"]) });
async function ownedRequest(req: AuthenticatedRequest) {
  const job = await accessibleJob(req);
  if (!job) return null;
  const [item] = await db.select().from(actionRequestsTable).where(and(
    eq(actionRequestsTable.id, Number(req.params.requestId)), eq(actionRequestsTable.jobId, job.id),
    eq(actionRequestsTable.requesterId, req.user!.id), eq(actionRequestsTable.kind, "transport_exception")));
  return item?.status === "Pending" ? item : null;
}
router.post("/jobs/:id/requests/:requestId/evidence/upload-url", requireAuth, requireRole("collection_company"), async (req: AuthenticatedRequest, res) => {
  const item = await ownedRequest(req);
  const data = schema.safeParse(req.body);
  if (!item) { res.status(404).json({ message: "Pending exception not found" }); return; }
  if (!data.success) { res.status(400).json({ message: "Use PDF, JPG or PNG up to 20MB" }); return; }
  const uploadURL = await storage.getObjectEntityUploadURL();
  const objectPath = storage.normalizeObjectEntityPath(uploadURL);
  const uploadToken = signUploadIntent({ jobId: item.jobId, userId: req.user!.id, docType: `exception-${item.id}`, objectPath,
    contentType: data.data.contentType, size: data.data.size, exp: Math.floor(Date.now() / 1000) + 900 });
  res.json({ uploadURL, objectPath, uploadToken });
});
router.post("/jobs/:id/requests/:requestId/evidence", requireAuth, requireRole("collection_company"), async (req: AuthenticatedRequest, res) => {
  const item = await ownedRequest(req);
  const data = schema.extend({ objectPath: z.string(), uploadToken: z.string() }).safeParse(req.body);
  if (!item) { res.status(404).json({ message: "Pending exception not found" }); return; }
  if (!data.success) { res.status(400).json({ message: "Invalid evidence" }); return; }
  const intent = verifyUploadIntent(data.data.uploadToken);
  if (!intent || intent.jobId !== item.jobId || intent.userId !== req.user!.id || intent.docType !== `exception-${item.id}` ||
    intent.objectPath !== data.data.objectPath || intent.size !== data.data.size || intent.contentType !== data.data.contentType) {
    res.status(400).json({ message: "Invalid upload session" }); return;
  }
  const file = await storage.getObjectEntityFile(intent.objectPath);
  const [meta] = await file.getMetadata();
  if (Number(meta.size) !== intent.size || meta.contentType !== intent.contentType) {
    res.status(400).json({ message: "File does not match declared evidence" }); return;
  }
  const [saved] = await db.insert(evidence).values({ requestId: item.id, objectPath: intent.objectPath, contentType: intent.contentType,
    sizeBytes: intent.size, fileName: data.data.name }).returning();
  await db.insert(accessAuditTable).values({ actorId: req.user!.id, jobId: item.jobId, action: "exception.evidence", details: { evidenceId: saved.id, requestId: item.id } });
  res.status(201).json({ evidence: { id: saved.id, fileName: saved.fileName } });
});
router.get("/action-requests/:id/evidence", requireAuth, requireRole("head_office_admin"), async (req, res) => {
  res.json({ evidence: await db.select({ id: evidence.id, fileName: evidence.fileName, contentType: evidence.contentType, sizeBytes: evidence.sizeBytes })
    .from(evidence).where(eq(evidence.requestId, Number(req.params.id))) });
});
router.get("/action-requests/:id/evidence/:evidenceId/download", requireAuth, requireRole("head_office_admin"), async (req, res) => {
  const [item] = await db.select().from(evidence).where(and(eq(evidence.requestId, Number(req.params.id)), eq(evidence.id, Number(req.params.evidenceId))));
  if (!item) { res.status(404).json({ message: "Evidence not found" }); return; }
  const response = await storage.downloadObject(await storage.getObjectEntityFile(item.objectPath));
  res.status(response.status);
  res.setHeader("Content-Type", item.contentType);
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Disposition", `attachment; filename="${item.fileName.replace(/["\\\r\n]/g, "_")}"`);
  if (response.body) Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res); else res.end();
});
export default router;
