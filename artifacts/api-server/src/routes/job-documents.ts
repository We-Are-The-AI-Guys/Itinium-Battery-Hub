import { Readable } from "stream";
import { createHmac, timingSafeEqual } from "crypto";
import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { jobsTable, jobDocumentsTable, accessAuditTable, JOB_DOCUMENT_TYPES, type JobDocumentType } from "@workspace/db/schema";
import { isAdmin } from "../lib/access-policy";
import { eq, and, sql, inArray, desc } from "drizzle-orm";
import { isClientUser, mayAccessDepot, jobScope } from "../lib/depot-access";
import { z } from "zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import {
  notifyAccountsStatementUploaded,
  notifyAdminsDocumentsComplete,
} from "../lib/notifications";

const router: IRouter = Router();
const CUSTOMER_DOCUMENT_TYPES = ["collection_sheet", "consignment_note"] as const;
const DOCUMENT_READ_ROLES = ["accounts", "head_office_admin", "collection_company", "team_leader", "depot_user"];
const objectStorage = new ObjectStorageService();

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const ALLOWED_CONTENT_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);

export const DOC_TYPE_LABELS: Record<JobDocumentType, string> = {
  collection_sheet: "Signed collection sheet",
  consignment_note: "Signed consignment note",
  statement: "Statement to Itinium",
};

// Documents are uploaded after the collection has been carried out: the job
// has moved past collection, or the confirmed collection date has arrived.
// Exported for tests.
export function canUploadDocuments(
  job: { scheduleStatus: string; status: string; collectionDate: string | null },
  today: string = new Date().toISOString().slice(0, 10)
): boolean {
  if (["received", "awaiting_invoice", "invoice", "completed"].includes(job.status)) return true;
  return job.scheduleStatus === "confirmed" && !!job.collectionDate && job.collectionDate <= today;
}

export function completesRequiredDocumentSet(
  existingTypes: readonly string[],
  uploadedType: string
): boolean {
  const available = new Set([...existingTypes, uploadedType]);
  return JOB_DOCUMENT_TYPES.every((type) => available.has(type));
}

// ---- Upload intents ----------------------------------------------------------
// Each signed upload URL is bound to a short-lived, HMAC-signed intent
// (job, doc type, object path, uploader, declared type/size). The record
// endpoint only accepts an object path presented with a matching intent, so
// clients cannot substitute arbitrary paths. Exported for tests.

export type UploadIntent = {
  jobId: number;
  userId: number;
  docType: string;
  objectPath: string;
  contentType: string;
  size: number;
  exp: number; // unix seconds
};

const INTENT_TTL_SEC = 15 * 60;

function intentSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required to sign upload intents");
  return secret;
}

export function signUploadIntent(intent: UploadIntent, secret: string = intentSecret()): string {
  const body = Buffer.from(JSON.stringify(intent)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export function verifyUploadIntent(
  token: string,
  secret: string = intentSecret(),
  nowSec: number = Math.floor(Date.now() / 1000)
): UploadIntent | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const intent = JSON.parse(Buffer.from(body, "base64url").toString()) as UploadIntent;
    if (typeof intent.exp !== "number" || intent.exp < nowSec) return null;
    return intent;
  } catch {
    return null;
  }
}

async function loadJobForCompany(req: AuthenticatedRequest, jobId: number) {
  if (isNaN(jobId)) return null;
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
  if (!job) return null;
  if (isClientUser(req.user!) && !mayAccessDepot(req.user!, job)) return null;
  if (req.user!.role === "collection_company") {
    if (!req.user!.collectionCompanyId || job.collectionCompanyId !== req.user!.collectionCompanyId) {
      return null;
    }
  }
  return job;
}

// ---- List documents (staff + owning collection company) --------------------

router.get("/customer/documents", requireAuth, requireRole("team_leader", "depot_user"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const documents = await db.select({
        jobId: jobsTable.id, reference: jobsTable.reference, depot: jobsTable.depot,
        docType: jobDocumentsTable.docType, fileName: jobDocumentsTable.fileName,
        uploadedAt: jobDocumentsTable.uploadedAt,
      }).from(jobDocumentsTable).innerJoin(jobsTable, eq(jobsTable.id, jobDocumentsTable.jobId))
        .where(and(jobScope(req.user!), eq(jobsTable.status, "completed"), inArray(jobDocumentsTable.docType, [...CUSTOMER_DOCUMENT_TYPES])))
        .orderBy(desc(jobDocumentsTable.uploadedAt));
      res.json({ documents });
    } catch (error) {
      console.error("Customer documents error:", error);
      res.status(500).json({ message: "Failed to load collection documents" });
    }
  });

router.get(
  "/jobs/:id/documents",
  requireAuth,
  requireRole(...DOCUMENT_READ_ROLES),
  async (req: AuthenticatedRequest, res) => {
    try {
      const job = await loadJobForCompany(req, parseInt(String(req.params.id), 10));
      if (!job) {
        res.status(404).json({ message: "Job not found" });
        return;
      }
      const visibleTypes = isAdmin(req.user!) ? [...JOB_DOCUMENT_TYPES] : [...CUSTOMER_DOCUMENT_TYPES];
      const documents = await db
        .select({
          id: jobDocumentsTable.id,
          docType: jobDocumentsTable.docType,
          fileName: jobDocumentsTable.fileName,
          contentType: jobDocumentsTable.contentType,
          sizeBytes: jobDocumentsTable.sizeBytes,
          uploadedAt: jobDocumentsTable.uploadedAt,
        })
        .from(jobDocumentsTable)
        .where(and(eq(jobDocumentsTable.jobId, job.id), inArray(jobDocumentsTable.docType, visibleTypes)));
      res.json({
        documents: isAdmin(req.user!) || job.status === "completed" ? documents : [],
        requiredTypes: visibleTypes,
        outstandingTypes: visibleTypes.filter((t) => !documents.some((d) => d.docType === t)),
        canUpload: !isClientUser(req.user!) && (isAdmin(req.user!) || canUploadDocuments(job)),
        releasePending: !isAdmin(req.user!) && job.status !== "completed",
      });
    } catch (error) {
      console.error("List job documents error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// ---- Upload flow (collection company only) ----------------------------------

const uploadUrlSchema = z.object({
  docType: z.enum(JOB_DOCUMENT_TYPES),
  name: z.string().min(1).max(255),
  size: z.number().int().positive().max(MAX_UPLOAD_BYTES),
  contentType: z.string().refine((ct) => ALLOWED_CONTENT_TYPES.has(ct), {
    message: "Only PDF or image files are allowed",
  }),
});

// Step 1: presigned URL. The file itself goes directly to object storage.
router.post(
  "/collection/jobs/:id/documents/upload-url",
  requireAuth,
  requireRole("collection_company"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = uploadUrlSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid upload request" });
        return;
      }
      if (!(CUSTOMER_DOCUMENT_TYPES as readonly string[]).includes(parsed.data.docType)) {
        res.status(403).json({ message: "Only signed collection sheets and consignment notes may be uploaded here" }); return;
      }
      const job = await loadJobForCompany(req, parseInt(String(req.params.id), 10));
      if (!job) {
        res.status(404).json({ message: "Collection not found" });
        return;
      }
      if (!isAdmin(req.user!) && !canUploadDocuments(job)) {
        res.status(400).json({ message: "Documents can be uploaded once the collection has been scheduled and carried out" });
        return;
      }
      const uploadURL = await objectStorage.getObjectEntityUploadURL();
      const objectPath = objectStorage.normalizeObjectEntityPath(uploadURL);
      const uploadToken = signUploadIntent({
        jobId: job.id,
        userId: req.user!.id,
        docType: parsed.data.docType,
        objectPath,
        contentType: parsed.data.contentType,
        size: parsed.data.size,
        exp: Math.floor(Date.now() / 1000) + INTENT_TTL_SEC,
      });
      res.json({ uploadURL, objectPath, uploadToken });
    } catch (error) {
      console.error("Document upload URL error:", error);
      res.status(500).json({ message: "Failed to prepare upload" });
    }
  }
);

const recordSchema = uploadUrlSchema.extend({
  objectPath: z.string().regex(/^\/objects\/[\w\-./]+$/, "Invalid object path"),
  uploadToken: z.string().min(1),
});

// Step 2: record the uploaded document. The upload token binds the object
// path to the caller/job/type declared in step 1, and the object's real
// metadata in storage is verified before anything is recorded or notified.
// Re-uploading a type replaces the previous record (latest file wins).
router.post(
  "/collection/jobs/:id/documents",
  requireAuth,
  requireRole("collection_company"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = recordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: parsed.error.issues[0]?.message || "Invalid document data" });
        return;
      }
      const job = await loadJobForCompany(req, parseInt(String(req.params.id), 10));
      if (!job) {
        res.status(404).json({ message: "Collection not found" });
        return;
      }
      if (!isAdmin(req.user!) && !canUploadDocuments(job)) {
        res.status(400).json({ message: "Documents can be uploaded once the collection has been scheduled and carried out" });
        return;
      }
      const { docType, name, size, contentType, objectPath, uploadToken } = parsed.data;
      if (!(CUSTOMER_DOCUMENT_TYPES as readonly string[]).includes(docType)) {
        res.status(403).json({ message: "This document type is not permitted" }); return;
      }

      // The intent must match the caller and everything they now claim.
      const intent = verifyUploadIntent(uploadToken);
      if (
        !intent ||
        intent.jobId !== job.id ||
        intent.userId !== req.user!.id ||
        intent.docType !== docType ||
        intent.objectPath !== objectPath ||
        intent.contentType !== contentType ||
        intent.size !== size
      ) {
        res.status(400).json({ message: "Upload session is invalid or has expired. Please upload the file again." });
        return;
      }

      // The file must actually exist in storage with the declared type and an
      // acceptable size before we record it or notify accounts.
      let storedSize: number;
      let storedContentType: string | undefined;
      try {
        const file = await objectStorage.getObjectEntityFile(objectPath);
        const [metadata] = await file.getMetadata();
        storedSize = Number(metadata.size ?? 0);
        storedContentType = metadata.contentType ?? undefined;
      } catch (err) {
        if (err instanceof ObjectNotFoundError) {
          res.status(400).json({ message: "The file was not uploaded. Please try again." });
          return;
        }
        throw err;
      }
      if (!storedSize || storedSize > MAX_UPLOAD_BYTES) {
        res.status(400).json({ message: "The uploaded file is empty or exceeds the 20 MB limit." });
        return;
      }
      if (storedContentType && !ALLOWED_CONTENT_TYPES.has(storedContentType)) {
        res.status(400).json({ message: "Only PDF or image files are allowed." });
        return;
      }

      const { document, documentsBecameComplete } = await db.transaction(async (tx) => {
        // Serialise uploads for this job so two simultaneous final uploads
        // cannot miss or duplicate the one-time completion notification.
        await tx.execute(sql`SELECT id FROM jobs WHERE id = ${job.id} FOR UPDATE`);
        const existingDocuments = await tx
          .select({ docType: jobDocumentsTable.docType })
          .from(jobDocumentsTable)
          .where(eq(jobDocumentsTable.jobId, job.id));
        const existingTypes = existingDocuments.map((item) => item.docType);
        const wasComplete = JOB_DOCUMENT_TYPES.every((type) => existingTypes.includes(type));

        const previous = await tx.select().from(jobDocumentsTable).where(and(eq(jobDocumentsTable.jobId, job.id), eq(jobDocumentsTable.docType, docType)));
        await tx.insert(accessAuditTable).values({ actorId: req.user!.id, jobId: job.id, action: "document.upload",
          details: { docType, objectPath, name, previous } });
        const [savedDocument] = await tx
          .insert(jobDocumentsTable)
          .values({
            jobId: job.id,
            docType,
            fileName: name,
            contentType: storedContentType || contentType,
            sizeBytes: storedSize,
            objectPath,
            uploadedById: req.user!.id,
          })
          .onConflictDoUpdate({
            target: [jobDocumentsTable.jobId, jobDocumentsTable.docType],
            set: {
              fileName: name,
              contentType: storedContentType || contentType,
              sizeBytes: storedSize,
              objectPath,
              uploadedById: req.user!.id,
              uploadedAt: new Date(),
            },
          })
          .returning();

        return {
          document: savedDocument,
          documentsBecameComplete: !wasComplete && completesRequiredDocumentSet(existingTypes, docType),
        };
      });

      // The statement triggers invoicing — tell accounts it has arrived.
      if (docType === "statement") {
        notifyAccountsStatementUploaded(
          {
            id: job.id,
            reference: job.reference,
            clientName: job.clientName,
            depot: job.depot,
            collectionDate: job.collectionDate,
            tonnage: job.tonnage,
            submittedById: job.submittedById,
          },
          name
        ).catch((err) => console.error("Failed to notify accounts of statement upload:", err));
      }
      if (documentsBecameComplete) {
        // Wait for the notification attempt before confirming the final
        // document record to the uploader. Notification delivery remains
        // non-blocking on provider failure inside the shared dispatcher, but
        // the process cannot exit while this completion event is still queued.
        await notifyAdminsDocumentsComplete({
          id: job.id,
          reference: job.reference,
          clientName: job.clientName,
          depot: job.depot,
          collectionDate: job.collectionDate,
          tonnage: job.tonnage,
          submittedById: job.submittedById,
        });
      }

      res.status(201).json({ document });
    } catch (error) {
      console.error("Record job document error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// ---- View/download (staff + owning collection company) ----------------------

async function serveDocument(
  req: AuthenticatedRequest,
  res: Parameters<Parameters<typeof router.get>[1]>[1],
  disposition: "inline" | "attachment"
) {
  const docType = String(req.params.docType);
  if (!isAdmin(req.user!) && !(CUSTOMER_DOCUMENT_TYPES as readonly string[]).includes(docType)) {
    res.status(404).json({ message: "Document not found" });
    return;
  }
  if (!(JOB_DOCUMENT_TYPES as readonly string[]).includes(docType)) {
    res.status(400).json({ message: "Unknown document type" });
    return;
  }
  const job = await loadJobForCompany(req, parseInt(String(req.params.id), 10));
  if (!job) {
    res.status(404).json({ message: "Job not found" });
    return;
  }
  if (!isAdmin(req.user!) && job.status !== "completed") {
    res.status(403).json({ message: "Signed documents are released when Itinium marks the job Completed" }); return;
  }
  const [doc] = await db
    .select()
    .from(jobDocumentsTable)
    .where(and(eq(jobDocumentsTable.jobId, job.id), eq(jobDocumentsTable.docType, docType)));
  if (!doc) {
    res.status(404).json({ message: "Document not uploaded yet" });
    return;
  }
  const file = await objectStorage.getObjectEntityFile(doc.objectPath);
  const response = await objectStorage.downloadObject(file);
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", doc.contentType);
  res.setHeader("Content-Disposition", `${disposition}; filename="${doc.fileName.replace(/["\\\r\n]/g, "_")}"`);
  if (response.body) {
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
  } else {
    res.end();
  }
}

router.get(
  "/jobs/:id/documents/:docType/view",
  requireAuth,
  requireRole(...DOCUMENT_READ_ROLES),
  async (req: AuthenticatedRequest, res) => {
    try {
      await serveDocument(req, res, "inline");
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ message: "Document file not found in storage" });
        return;
      }
      console.error("View job document error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.get(
  "/jobs/:id/documents/:docType/download",
  requireAuth,
  requireRole(...DOCUMENT_READ_ROLES),
  async (req: AuthenticatedRequest, res) => {
    try {
      await serveDocument(req, res, "attachment");
    } catch (error) {
      if (error instanceof ObjectNotFoundError) {
        res.status(404).json({ message: "Document file not found in storage" });
        return;
      }
      console.error("Download job document error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
