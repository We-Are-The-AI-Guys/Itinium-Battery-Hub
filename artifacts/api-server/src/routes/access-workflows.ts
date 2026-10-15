import { Router } from "express";
import { db } from "@workspace/db";
import { actionRequestsTable as requests, supportEnquiriesTable as tickets, accessSettingsTable as settings, accessAuditTable as audit, jobsTable, jobBatteriesTable, usersTable, notificationsTable, exceptionEvidenceTable as evidence } from "@workspace/db/schema";
import { and, desc, eq, sql, getTableColumns, inArray } from "drizzle-orm";
import { requestAllowed } from "../lib/job-request-policy";
import { z } from "zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { isAdmin, isCustomer, hasRole, customerJob } from "../lib/access-policy";
import { mayAccessDepot, jobScope } from "../lib/depot-access";
import { Resend } from "resend";
import { escapeHtml } from "../lib/notifications";

const router = Router();
router.post("/jobs/:id/verify-weight", requireAuth, requireRole("head_office_admin"), async (req: AuthenticatedRequest, res) => {
  const job = await accessibleJob(req);
  if (!job) { res.status(404).json({ message: "Job not found" }); return; }
  const notes = String(req.body.notes || "").trim();
  const rows = await db.select().from(jobBatteriesTable).where(eq(jobBatteriesTable.jobId, job.id));
  if (!notes || !rows.length || rows.some(row => !(Number(row.estimatedWeightKg) > 0) || row.cellModelFlagReason || row.voltageFlagReason) || Number(job.tonnage) > 26) {
    res.status(400).json({ message: "Resolve unknown weights, ensure load is no more than 26t, and record verification notes" }); return;
  }
  await db.transaction(async tx => {
    await tx.update(jobsTable).set({ weightVerificationRequired: false }).where(eq(jobsTable.id, job.id));
    await tx.insert(audit).values({ actorId: req.user!.id, jobId: job.id, action: "weight.verified", details: { notes, tonnage: job.tonnage } });
  });
  res.json({ verified: true });
});
export async function notifyWorkflow(target: "operationsEmail" | "supportEmail" | string, subject: string, body: string) {
  const [config] = await db.select().from(settings).where(eq(settings.id, 1));
  const to = target === "operationsEmail" || target === "supportEmail" ? config?.[target] : target;
  if (!to || !config?.senderEmail || !process.env.RESEND_API_KEY) return "Pending configuration";
  try {
    const result = await new Resend(process.env.RESEND_API_KEY).emails.send({
      from: config.senderEmail, to, subject, html: `<p>${escapeHtml(body).replace(/\n/g, "<br>")}</p>`,
    });
    return result.error ? "Delivery failed" : "Sent";
  } catch { return "Delivery failed"; }
}
export async function accessibleJob(req: AuthenticatedRequest) {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, id));
  if (!job) return null;
  if (isAdmin(req.user!)) return job;
  if (isCustomer(req.user!)) return mayAccessDepot(req.user!, job) ? job : null;
  return hasRole(req.user!, "collection_company") && req.user!.collectionCompanyId &&
    job.collectionCompanyId === req.user!.collectionCompanyId && job.collectionReleasedAt ? job : null;
}
async function physicallyReported(conn: Pick<typeof db, "select">, jobId: number) {
  const rows = await conn.select({ id: requests.id }).from(requests).where(and(
    eq(requests.jobId, jobId), eq(requests.kind, "transport_exception"),
    inArray(requests.outcome, ["completed", "partially_completed"]),
  )).limit(1);
  return rows.length > 0;
}
router.get("/operational-overview", requireAuth, async (req: AuthenticatedRequest, res) => {
  const jobs = await db.select().from(jobsTable).where(jobScope(req.user!)).orderBy(desc(jobsTable.submittedAt));
  const counts: Record<string, number> = {};
  for (const job of jobs) counts[job.status] = (counts[job.status] ?? 0) + 1;
  res.json({ jobs: jobs.map(customerJob), total: jobs.length, counts,
    totalTonnage: jobs.reduce((sum, job) => sum + Number(job.tonnage || 0), 0) });
});
const requestSchema = z.object({
  kind: z.enum(["amendment", "cancellation", "transport_exception"]),
  notes: z.string().trim().min(1).max(10000),
  outcome: z.enum(["completed", "failed", "missed", "partially_completed", "other"]).optional(),
});
router.post("/jobs/:id/requests", requireAuth, async (req: AuthenticatedRequest, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ message: "Provide request type and explanatory notes" }); return; }
  const job = await accessibleJob(req);
  if (!job) { res.status(404).json({ message: "Job not found" }); return; }
  const collector = hasRole(req.user!, "collection_company");
  if (collector ? parsed.data.kind !== "transport_exception" || !parsed.data.outcome :
    !isCustomer(req.user!) || parsed.data.kind === "transport_exception") {
    res.status(403).json({ message: "This request type is not permitted" }); return;
  }
  const saved = await db.transaction(async tx => {
    const [current] = await tx.select().from(jobsTable).where(eq(jobsTable.id, job.id)).for("update");
    if (!current || (!collector && !requestAllowed(parsed.data.kind, current.status))) return null;
    if (!collector && parsed.data.kind === "cancellation" && await physicallyReported(tx, job.id)) return null;
    const [item] = await tx.insert(requests).values({ ...parsed.data, jobId: job.id, requesterId: req.user!.id }).returning();
    await tx.insert(audit).values({ actorId: req.user!.id, jobId: job.id, action: "request.created", details: { requestId: item.id, ...parsed.data } });
    return item;
  });
  if (!saved) { res.status(409).json({ message: "Amendments are available before Completed; cancellations are available only before physical collection. Cancelled jobs are closed." }); return; }
  const notificationStatus = await notifyWorkflow("operationsEmail", `Job request: ${job.reference}`, `${parsed.data.kind}: ${parsed.data.notes}`);
  await db.update(requests).set({ notificationStatus }).where(eq(requests.id, saved.id));
  res.status(201).json({ request: { ...saved, notificationStatus } });
});
router.get("/jobs/:id/requests", requireAuth, async (req: AuthenticatedRequest, res) => {
  const job = await accessibleJob(req);
  if (!job) { res.status(404).json({ message: "Job not found" }); return; }
  const items = await db.select().from(requests).where(and(eq(requests.jobId, job.id),
    isAdmin(req.user!) ? undefined : eq(requests.requesterId, req.user!.id))).orderBy(desc(requests.createdAt));
  const physical = ["request", "confirmed"].includes(job.status) ? await physicallyReported(db, job.id) : true;
  res.json({ requests: items, canRequestAmendment: isCustomer(req.user!) && requestAllowed("amendment", job.status),
    canRequestCancellation: isCustomer(req.user!) && requestAllowed("cancellation", job.status, physical) });
});
router.get("/action-requests", requireAuth, requireRole("head_office_admin"), async (_req, res) => {
  const items = await db.select({ ...getTableColumns(requests), reference: jobsTable.reference, requesterName: usersTable.fullName })
    .from(requests).innerJoin(jobsTable, eq(requests.jobId, jobsTable.id))
    .innerJoin(usersTable, eq(requests.requesterId, usersTable.id)).orderBy(desc(requests.createdAt));
  res.json({ requests: items });
});
router.patch("/action-requests/:id", requireAuth, requireRole("head_office_admin"), async (req: AuthenticatedRequest, res) => {
  const data = z.object({ status: z.enum(["Approved", "Rejected"]), decisionNotes: z.string().trim().min(1).max(10000) }).safeParse(req.body);
  if (!data.success) { res.status(400).json({ message: "A decision and explanatory notes are required" }); return; }
  const result = await db.transaction(async tx => {
    const [item] = await tx.select().from(requests).where(eq(requests.id, Number(req.params.id))).for("update");
    if (!item || item.status !== "Pending") return null;
    const [job] = await tx.select().from(jobsTable).where(eq(jobsTable.id, item.jobId)).for("update");
    if (!job || (data.data.status === "Approved" && !requestAllowed(item.kind, job.status))) return null;
    if (data.data.status === "Approved" && item.kind === "cancellation" && await physicallyReported(tx, job.id)) return null;
    if (item.kind === "cancellation" && data.data.status === "Approved") {
      await tx.update(jobsTable).set({ status: "cancelled" }).where(eq(jobsTable.id, item.jobId));
    }
    const [updated] = await tx.update(requests).set({ ...data.data, decidedById: req.user!.id, decidedAt: new Date() })
      .where(eq(requests.id, item.id)).returning();
    await tx.insert(audit).values({ actorId: req.user!.id, jobId: item.jobId, action: "request.decided", details: { requestId: item.id, ...data.data, priorJobStatus: job.status } });
    await tx.insert(notificationsTable).values({ userId: item.requesterId, jobId: item.jobId, type: "request_decision",
      title: `Request ${data.data.status}`, body: data.data.decisionNotes, link: item.kind === "transport_exception" ? "/collections" : `/jobs/${item.jobId}` });
    return updated;
  });
  if (!result) { res.status(409).json({ message: "Request unavailable, already decided, or no longer eligible. Amendments close at Completed; cancellations close at physical collection." }); return; }
  const [requester] = await db.select().from(usersTable).where(eq(usersTable.id, result.requesterId));
  const notificationStatus = await notifyWorkflow(requester.email, `Request ${result.status}`, result.decisionNotes!);
  await db.update(requests).set({ notificationStatus }).where(eq(requests.id, result.id));
  res.json({ request: { ...result, notificationStatus } });
});
router.get("/support/tickets", requireAuth, async (req: AuthenticatedRequest, res) => {
  res.json({ tickets: await db.select().from(tickets).where(isAdmin(req.user!) ? undefined : eq(tickets.requesterId, req.user!.id)).orderBy(desc(tickets.createdAt)) });
});
router.post("/support/ticket", requireAuth, async (req: AuthenticatedRequest, res) => {
  const data = z.object({ title: z.string().trim().min(1).max(255), details: z.string().trim().min(1).max(10000) }).safeParse(req.body);
  if (!data.success) { res.status(400).json({ message: "Title and details are required" }); return; }
  const [ticket] = await db.insert(tickets).values({ ...data.data, requesterId: req.user!.id }).returning();
  const notificationStatus = await notifyWorkflow("supportEmail", `Support enquiry ${ticket.id}: ${ticket.title}`, ticket.details);
  await db.update(tickets).set({ notificationStatus }).where(eq(tickets.id, ticket.id));
  res.status(201).json({ success: true, ticket: { ...ticket, notificationStatus } });
});
router.patch("/support/tickets/:id", requireAuth, requireRole("head_office_admin"), async (req: AuthenticatedRequest, res) => {
  const data = z.object({ status: z.enum(["New", "In Progress", "Resolved"]) }).safeParse(req.body);
  if (!data.success) { res.status(400).json({ message: "Invalid support status" }); return; }
  const result = await db.transaction(async tx => {
    const [before] = await tx.select().from(tickets).where(eq(tickets.id, Number(req.params.id))).for("update");
    if (!before) return null;
    const [ticket] = await tx.update(tickets).set({ status: data.data.status, updatedAt: new Date() }).where(eq(tickets.id, before.id)).returning();
    await tx.insert(audit).values({ actorId: req.user!.id, action: "support.status", details: { ticketId: before.id, before: before.status, after: ticket.status } });
    const notify = before.status !== "Resolved" && ticket.status === "Resolved";
    if (notify) await tx.insert(notificationsTable).values({ userId: ticket.requesterId, type: "support_resolved", title: "Support enquiry resolved", body: ticket.title, link: "/support" });
    return { ticket, notify };
  });
  if (!result) { res.status(404).json({ message: "Enquiry not found" }); return; }
  if (result.notify) {
    const [requester] = await db.select().from(usersTable).where(eq(usersTable.id, result.ticket.requesterId));
    result.ticket.notificationStatus = await notifyWorkflow(requester.email, "Support enquiry resolved", `Your enquiry "${result.ticket.title}" has been marked Resolved.`);
    await db.update(tickets).set({ notificationStatus: result.ticket.notificationStatus }).where(eq(tickets.id, result.ticket.id));
  }
  res.json(result);
});
router.get("/v16/settings", requireAuth, requireRole("head_office_admin"), async (_req, res) => {
  const [config] = await db.select().from(settings).where(eq(settings.id, 1));
  res.json(config ?? { operationsEmail: "", supportEmail: "", senderEmail: "" });
});
router.patch("/v16/settings", requireAuth, requireRole("head_office_admin"), async (req: AuthenticatedRequest, res) => {
  const email = z.union([z.string().email(), z.literal(""), z.null()]).optional();
  const data = z.object({ operationsEmail: email, supportEmail: email, senderEmail: email }).safeParse(req.body);
  if (!data.success) { res.status(400).json({ message: "Enter valid email addresses or leave blank" }); return; }
  const [config] = await db.insert(settings).values({ id: 1, ...data.data }).onConflictDoUpdate({ target: settings.id, set: data.data }).returning();
  await db.insert(audit).values({ actorId: req.user!.id, action: "settings.notifications", details: data.data });
  res.json(config);
});
router.get("/access-audit", requireAuth, requireRole("head_office_admin"), async (_req, res) => {
  res.json({ events: await db.select().from(audit).orderBy(desc(audit.createdAt)).limit(500) });
});
export default router;
