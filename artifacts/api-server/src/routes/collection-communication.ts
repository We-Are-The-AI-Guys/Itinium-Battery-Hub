import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  jobsTable, usersTable, companyDriversTable, companyVehiclesTable,
  collectionMessagesTable, collectionAssignmentChangesTable,
} from "@workspace/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { dispatchNotification, dispatchToMany, escapeHtml, recipientsWithRoles } from "../lib/notifications";
import { buildBrandedEmail } from "../lib/email";

const router: IRouter = Router();
const roles = ["collection_company", "accounts", "head_office_admin"];
type CollectorAccess = Pick<NonNullable<AuthenticatedRequest["user"]>, "role" | "collectionCompanyId">;
type JobAccess = { collectionCompanyId: number | null };

export function mayAccessCollectionConversation(user: CollectorAccess, job: JobAccess): boolean {
  if (user.role === "accounts" || user.role === "head_office_admin") return true;
  return user.role === "collection_company" && user.collectionCompanyId != null
    && job.collectionCompanyId === user.collectionCompanyId;
}

function parseJobId(raw: string | string[]): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

async function notifyOtherSide(
  user: NonNullable<AuthenticatedRequest["user"]>,
  job: { id: number; reference: string; collectionCompanyId: number | null; submittedById?: number | null },
  type: "message" | "assignment",
  details?: { driverName: string; vehicleReg: string; collectionDate: string | null },
) {
  const collectorIds = job.collectionCompanyId
    ? (await db.select({ id: usersTable.id }).from(usersTable).where(and(
      eq(usersTable.role, "collection_company"),
      eq(usersTable.collectionCompanyId, job.collectionCompanyId),
      eq(usersTable.isActive, true),
    ))).map((row) => row.id)
    : [];
  const adminIds = await recipientsWithRoles(["accounts", "head_office_admin"]);
  const recipients = user.role === "collection_company" ? adminIds : collectorIds;
  const title = type === "message" ? `New collection message — ${job.reference}` : `Collection assignment updated — ${job.reference}`;
  const body = type === "message"
    ? `${user.fullName} sent a message about ${job.reference}.`
    : `${job.reference}: driver ${details!.driverName}, vehicle ${details!.vehicleReg}. Confirmed date unchanged (${details!.collectionDate || "not set"}).`;
  const emailHtml = type === "assignment" && details
    ? buildBrandedEmail(escapeHtml(title), `<p>The vehicle or driver for collection <strong>${escapeHtml(job.reference)}</strong> has changed. The confirmed collection date remains ${escapeHtml(details.collectionDate || "unchanged")}.</p><p>Driver: ${escapeHtml(details.driverName)}<br>Vehicle: ${escapeHtml(details.vehicleReg)}</p>`)
    : undefined;
  await dispatchToMany(recipients.filter((id) => id !== user.id), {
    type: type === "message" ? "collection_message" : "collection_assignment_updated",
    title, body,
    link: user.role === "collection_company" ? `/jobs/${job.id}` : `/collections?conversation=${job.id}`,
    emailSubject: type === "assignment" ? title : undefined,
    emailHtml,
  });
  // An assignment made by the collector also needs to reach the other users
  // at that company. Their email is currently suppressed during collector testing.
  if (type === "assignment" && user.role === "collection_company") {
    await dispatchToMany(collectorIds.filter((id) => id !== user.id), {
      type: "collection_assignment_updated", title, body, link: `/collections?conversation=${job.id}`,
    });
  }
  if (type === "assignment" && job.submittedById && job.submittedById !== user.id) {
    await dispatchNotification(job.submittedById, {
      type: "collection_assignment_updated", title, body, link: `/`,
      emailSubject: title, emailHtml, emailPrefKey: "jobApprovedCompleted",
    });
  }
}

router.get("/collection/jobs/:id/messages", requireAuth, requireRole(...roles),
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const jobId = parseJobId(req.params.id);
      if (!jobId) { res.status(400).json({ message: "Invalid job ID" }); return; }
      const [job] = await db.select({ collectionCompanyId: jobsTable.collectionCompanyId }).from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job || !mayAccessCollectionConversation(req.user!, job)) {
        res.status(404).json({ message: "Collection not found" }); return;
      }
      const messages = await db.select().from(collectionMessagesTable)
        .where(eq(collectionMessagesTable.jobId, jobId)).orderBy(desc(collectionMessagesTable.createdAt), desc(collectionMessagesTable.id)).limit(200);
      res.json({ messages: messages.reverse() });
    } catch (error) {
      console.error("Collection messages read error:", error);
      res.status(500).json({ message: "Could not load messages" });
    }
  });

const messageSchema = z.object({ body: z.string().trim().min(1).max(2000) });
router.post("/collection/jobs/:id/messages", requireAuth, requireRole(...roles),
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const jobId = parseJobId(req.params.id);
      const parsed = messageSchema.safeParse(req.body);
      if (!jobId || !parsed.success) { res.status(400).json({ message: "Enter a message (maximum 2,000 characters)" }); return; }
      const result = await db.transaction(async (tx) => {
        const [job] = await tx.select({
          id: jobsTable.id, reference: jobsTable.reference, collectionCompanyId: jobsTable.collectionCompanyId,
        }).from(jobsTable).where(eq(jobsTable.id, jobId)).for("update");
        if (!job || !job.collectionCompanyId || !mayAccessCollectionConversation(req.user!, job)) return null;
        const [message] = await tx.insert(collectionMessagesTable).values({
          jobId, authorId: req.user!.id, authorName: req.user!.fullName,
          authorRole: req.user!.role, body: parsed.data.body,
        }).returning();
        return { job, message };
      });
      if (!result) { res.status(404).json({ message: "Collection not found" }); return; }
      notifyOtherSide(req.user!, result.job, "message").catch((error) => console.error("Message notification failed:", error));
      res.status(201).json({ message: result.message });
    } catch (error) {
      console.error("Collection message create error:", error);
      res.status(500).json({ message: "Could not send message" });
    }
  });

const assignmentSchema = z.object({
  driverId: z.number().int().positive(), vehicleId: z.number().int().positive(),
});
router.patch("/collection/jobs/:id/assignment", requireAuth, requireRole(...roles),
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const jobId = parseJobId(req.params.id);
      const parsed = assignmentSchema.safeParse(req.body);
      if (!jobId || !parsed.success) { res.status(400).json({ message: "Choose an active driver and vehicle" }); return; }
      const outcome = await db.transaction(async (tx) => {
        const [job] = await tx.select().from(jobsTable).where(eq(jobsTable.id, jobId)).for("update");
        if (!job || !job.collectionCompanyId || !mayAccessCollectionConversation(req.user!, job)) return { error: 404 as const, message: "Collection not found" };
        if (job.scheduleStatus !== "confirmed" || job.status !== "confirmed" || !job.collectionDate) {
          return { error: 400 as const, message: "Only a confirmed, upcoming collection can change driver or vehicle" };
        }
        const [driver] = await tx.select().from(companyDriversTable).where(and(
          eq(companyDriversTable.id, parsed.data.driverId), eq(companyDriversTable.companyId, job.collectionCompanyId), eq(companyDriversTable.isActive, true),
        ));
        const [vehicle] = await tx.select().from(companyVehiclesTable).where(and(
          eq(companyVehiclesTable.id, parsed.data.vehicleId), eq(companyVehiclesTable.companyId, job.collectionCompanyId), eq(companyVehiclesTable.isActive, true),
        ));
        if (!driver || !vehicle) return { error: 400 as const, message: "Driver or vehicle is not active for the assigned company" };
        if (driver.name === job.driverName && vehicle.registration === job.vehicleReg) {
          return { error: 400 as const, message: "Choose a different driver or vehicle" };
        }
        const [updated] = await tx.update(jobsTable).set({
          driverName: driver.name, vehicleReg: vehicle.registration,
        }).where(eq(jobsTable.id, jobId)).returning({
          id: jobsTable.id, driverName: jobsTable.driverName, vehicleReg: jobsTable.vehicleReg,
          collectionDate: jobsTable.collectionDate, scheduleStatus: jobsTable.scheduleStatus,
        });
        await tx.insert(collectionAssignmentChangesTable).values({
          jobId, oldDriverName: job.driverName, newDriverName: driver.name,
          oldVehicleReg: job.vehicleReg, newVehicleReg: vehicle.registration,
          changedById: req.user!.id, changedByName: req.user!.fullName,
        });
        return { job, updated };
      });
      if ("error" in outcome && outcome.error) { res.status(outcome.error).json({ message: outcome.message }); return; }
      notifyOtherSide(req.user!, outcome.job, "assignment", {
        driverName: outcome.updated.driverName!, vehicleReg: outcome.updated.vehicleReg!, collectionDate: outcome.updated.collectionDate,
      }).catch((error) => console.error("Assignment notification failed:", error));
      res.json({ job: outcome.updated });
    } catch (error) {
      console.error("Assignment change error:", error);
      res.status(500).json({ message: "Could not change assignment" });
    }
  });

router.get("/collection/jobs/:id/assignment-changes", requireAuth, requireRole(...roles),
  async (req: AuthenticatedRequest, res): Promise<void> => {
    try {
      const jobId = parseJobId(req.params.id);
      if (!jobId) { res.status(400).json({ message: "Invalid job ID" }); return; }
      const [job] = await db.select({ collectionCompanyId: jobsTable.collectionCompanyId }).from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job || !mayAccessCollectionConversation(req.user!, job)) { res.status(404).json({ message: "Collection not found" }); return; }
      const changes = await db.select().from(collectionAssignmentChangesTable)
        .where(eq(collectionAssignmentChangesTable.jobId, jobId)).orderBy(desc(collectionAssignmentChangesTable.changedAt)).limit(100);
      res.json({ changes });
    } catch (error) {
      console.error("Assignment history error:", error);
      res.status(500).json({ message: "Could not load assignment history" });
    }
  });

export default router;