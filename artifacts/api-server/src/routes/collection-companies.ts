import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  collectionCompaniesTable,
  companyVehiclesTable,
  companyDriversTable,
  jobsTable,
  locationsTable,
} from "@workspace/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { requireAuth, requireRole, type AuthenticatedRequest } from "../middlewares/auth";
import { z } from "zod";
import {
  notifyAdminsScheduleProposed,
  notifySiteContactScheduleConfirmed,
  type JobRef,
} from "../lib/notifications";
import { advanceJobStatusSql } from "../lib/job-status";

const router: IRouter = Router();

export const collectorJobSelection = {
  id: jobsTable.id,
  reference: jobsTable.reference,
  clientName: jobsTable.clientName,
  depot: jobsTable.depot,
  locationId: jobsTable.locationId,
  collectionPoint: jobsTable.collectionPoint,
  collectionDate: jobsTable.collectionDate,
  proposedCollectionDate: jobsTable.proposedCollectionDate,
  scheduleStatus: jobsTable.scheduleStatus,
  driverName: jobsTable.driverName,
  vehicleReg: jobsTable.vehicleReg,
  siteContacts: jobsTable.siteContacts,
  siteHours: jobsTable.siteHours,
  specialInstructions: jobsTable.specialInstructions,
  notes: jobsTable.notes,
  tonnage: jobsTable.tonnage,
  status: jobsTable.status,
  submittedAt: jobsTable.submittedAt,
};

// Resolves which company the caller may act for. Collection-company users
// are locked to their own company; admins may pass any company id.
function resolveCompanyId(req: AuthenticatedRequest, requested?: number): number | null {
  if (req.user!.role === "collection_company") {
    return req.user!.collectionCompanyId ?? null;
  }
  return requested ?? null;
}

// ---- Companies -------------------------------------------------------------

router.get(
  "/collection-companies",
  requireAuth,
  requireRole("head_office_admin", "accounts"),
  async (_req: AuthenticatedRequest, res) => {
    try {
      const companies = await db
        .select()
        .from(collectionCompaniesTable)
        .orderBy(collectionCompaniesTable.name);
      res.json({ companies });
    } catch (error) {
      console.error("List collection companies error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// ---- Fleet (vehicles & drivers) --------------------------------------------

router.get(
  "/collection-companies/fleet",
  requireAuth,
  requireRole("collection_company", "head_office_admin", "accounts"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const requested = req.query.companyId ? parseInt(String(req.query.companyId), 10) : undefined;
      const companyId = resolveCompanyId(req, requested);
      if (!companyId) {
        res.status(400).json({ message: "No collection company specified" });
        return;
      }
      const [company] = await db
        .select()
        .from(collectionCompaniesTable)
        .where(eq(collectionCompaniesTable.id, companyId));
      if (!company) {
        res.status(404).json({ message: "Collection company not found" });
        return;
      }
      const [vehicles, drivers] = await Promise.all([
        db.select().from(companyVehiclesTable).where(eq(companyVehiclesTable.companyId, companyId)).orderBy(companyVehiclesTable.registration),
        db.select().from(companyDriversTable).where(eq(companyDriversTable.companyId, companyId)).orderBy(companyDriversTable.name),
      ]);
      res.json({ company, vehicles, drivers });
    } catch (error) {
      console.error("Fleet list error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const fleetItemSchema = z.object({
  companyId: z.number().optional(),
  value: z.string().min(1).max(255),
});

router.post(
  "/collection-companies/vehicles",
  requireAuth,
  requireRole("collection_company", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = fleetItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid vehicle data", errors: parsed.error.issues });
        return;
      }
      const companyId = resolveCompanyId(req, parsed.data.companyId);
      if (!companyId) {
        res.status(400).json({ message: "No collection company specified" });
        return;
      }
      const [vehicle] = await db
        .insert(companyVehiclesTable)
        .values({ companyId, registration: parsed.data.value.trim() })
        .returning();
      res.status(201).json({ vehicle });
    } catch (error) {
      console.error("Create vehicle error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.post(
  "/collection-companies/drivers",
  requireAuth,
  requireRole("collection_company", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const parsed = fleetItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ message: "Invalid driver data", errors: parsed.error.issues });
        return;
      }
      const companyId = resolveCompanyId(req, parsed.data.companyId);
      if (!companyId) {
        res.status(400).json({ message: "No collection company specified" });
        return;
      }
      const [driver] = await db
        .insert(companyDriversTable)
        .values({ companyId, name: parsed.data.value.trim() })
        .returning();
      res.status(201).json({ driver });
    } catch (error) {
      console.error("Create driver error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const fleetUpdateSchema = z.object({
  value: z.string().min(1).max(255).optional(),
  isActive: z.boolean().optional(),
});

router.patch(
  "/collection-companies/vehicles/:id",
  requireAuth,
  requireRole("collection_company", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const parsed = fleetUpdateSchema.safeParse(req.body);
      if (isNaN(id) || !parsed.success) {
        res.status(400).json({ message: "Invalid update data" });
        return;
      }
      const [existing] = await db.select().from(companyVehiclesTable).where(eq(companyVehiclesTable.id, id));
      if (!existing) {
        res.status(404).json({ message: "Vehicle not found" });
        return;
      }
      if (req.user!.role === "collection_company" && existing.companyId !== req.user!.collectionCompanyId) {
        res.status(403).json({ message: "Access denied" });
        return;
      }
      const updates: Record<string, unknown> = {};
      if (parsed.data.value !== undefined) updates.registration = parsed.data.value.trim();
      if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
      if (Object.keys(updates).length === 0) {
        res.status(400).json({ message: "No fields to update" });
        return;
      }
      const [vehicle] = await db.update(companyVehiclesTable).set(updates).where(eq(companyVehiclesTable.id, id)).returning();
      res.json({ vehicle });
    } catch (error) {
      console.error("Update vehicle error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

router.patch(
  "/collection-companies/drivers/:id",
  requireAuth,
  requireRole("collection_company", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const id = parseInt(String(req.params.id), 10);
      const parsed = fleetUpdateSchema.safeParse(req.body);
      if (isNaN(id) || !parsed.success) {
        res.status(400).json({ message: "Invalid update data" });
        return;
      }
      const [existing] = await db.select().from(companyDriversTable).where(eq(companyDriversTable.id, id));
      if (!existing) {
        res.status(404).json({ message: "Driver not found" });
        return;
      }
      if (req.user!.role === "collection_company" && existing.companyId !== req.user!.collectionCompanyId) {
        res.status(403).json({ message: "Access denied" });
        return;
      }
      const updates: Record<string, unknown> = {};
      if (parsed.data.value !== undefined) updates.name = parsed.data.value.trim();
      if (parsed.data.isActive !== undefined) updates.isActive = parsed.data.isActive;
      if (Object.keys(updates).length === 0) {
        res.status(400).json({ message: "No fields to update" });
        return;
      }
      const [driver] = await db.update(companyDriversTable).set(updates).where(eq(companyDriversTable.id, id)).returning();
      res.json({ driver });
    } catch (error) {
      console.error("Update driver error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// ---- Collection-company job view & assignment ------------------------------

// Restricted list: only collections assigned to the caller's company, and
// only non-financial fields.
router.get(
  "/collection/jobs",
  requireAuth,
  requireRole("collection_company"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const companyId = req.user!.collectionCompanyId;
      if (!companyId) {
        res.status(403).json({ message: "Your account is not linked to a collection company" });
        return;
      }
      const jobs = await db
        .select(collectorJobSelection)
        .from(jobsTable)
        .where(
          and(
            eq(jobsTable.collectionCompanyId, companyId),
            // Post-collection statuses stay visible so the company can upload
            // the signed paperwork and their statement after the collection.
            inArray(jobsTable.status, ["request", "confirmed", "received", "awaiting_invoice", "invoice", "completed"])
          )
        )
        .orderBy(desc(jobsTable.submittedAt))
        .limit(200);

      const locationIds = [...new Set(jobs.map((j) => j.locationId).filter((v): v is number => v != null))];
      const addresses = new Map<number, string>();
      if (locationIds.length > 0) {
        const locs = await db
          .select({ id: locationsTable.id, address: locationsTable.address })
          .from(locationsTable)
          .where(inArray(locationsTable.id, locationIds));
        for (const l of locs) {
          if (l.address) addresses.set(l.id, l.address);
        }
      }
      res.json({
        jobs: jobs.map((j) => ({
          ...j,
          siteAddress: j.collectionPoint || (j.locationId ? addresses.get(j.locationId) : null) || j.depot,
        })),
      });
    } catch (error) {
      console.error("Collection jobs list error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

const assignSchema = z.object({
  vehicleId: z.number(),
  driverId: z.number(),
  proposedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
});

router.post(
  "/collection/jobs/:id/assign",
  requireAuth,
  requireRole("collection_company"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      const parsed = assignSchema.safeParse(req.body);
      if (isNaN(jobId) || !parsed.success) {
        res.status(400).json({ message: "Invalid assignment data", errors: parsed.success ? undefined : parsed.error.issues });
        return;
      }
      const companyId = req.user!.collectionCompanyId;
      if (!companyId) {
        res.status(403).json({ message: "Your account is not linked to a collection company" });
        return;
      }
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job || job.collectionCompanyId !== companyId) {
        res.status(404).json({ message: "Collection not found" });
        return;
      }
      if (!["request", "confirmed"].includes(job.status)) {
        res.status(400).json({ message: "This collection can no longer be scheduled" });
        return;
      }
      // Once Itinium has confirmed the date with the customer, the schedule is
      // locked — changes must go through Itinium (who can reschedule).
      if (job.scheduleStatus === "confirmed") {
        res.status(400).json({ message: "This collection has been confirmed by Itinium. Please contact Itinium to change the schedule." });
        return;
      }

      const [vehicle] = await db
        .select()
        .from(companyVehiclesTable)
        .where(and(eq(companyVehiclesTable.id, parsed.data.vehicleId), eq(companyVehiclesTable.companyId, companyId), eq(companyVehiclesTable.isActive, true)));
      const [driver] = await db
        .select()
        .from(companyDriversTable)
        .where(and(eq(companyDriversTable.id, parsed.data.driverId), eq(companyDriversTable.companyId, companyId), eq(companyDriversTable.isActive, true)));
      if (!vehicle || !driver) {
        res.status(400).json({ message: "Vehicle or driver not found for your company" });
        return;
      }

      const [updated] = await db
        .update(jobsTable)
        .set({
          driverName: driver.name,
          vehicleReg: vehicle.registration,
          proposedCollectionDate: parsed.data.proposedDate,
          scheduleStatus: "proposed",
        })
        .where(eq(jobsTable.id, jobId))
        .returning({
          id: jobsTable.id,
          reference: jobsTable.reference,
          driverName: jobsTable.driverName,
          vehicleReg: jobsTable.vehicleReg,
          proposedCollectionDate: jobsTable.proposedCollectionDate,
          scheduleStatus: jobsTable.scheduleStatus,
        });

      const [company] = await db
        .select({ name: collectionCompaniesTable.name })
        .from(collectionCompaniesTable)
        .where(eq(collectionCompaniesTable.id, companyId));

      const jobRef: JobRef = {
        id: job.id,
        reference: job.reference,
        clientName: job.clientName,
        depot: job.depot,
        collectionDate: parsed.data.proposedDate,
        tonnage: job.tonnage,
        submittedById: job.submittedById,
      };
      notifyAdminsScheduleProposed(jobRef, {
        companyName: company?.name || "Collection company",
        driverName: driver.name,
        vehicleReg: vehicle.registration,
        proposedDate: parsed.data.proposedDate,
      }).catch((err) => console.error("Failed to notify admins of proposed schedule:", err));

      res.json({ job: updated });
    } catch (error) {
      console.error("Assign schedule error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

// ---- Itinium confirmation ---------------------------------------------------

const confirmSchema = z.object({
  collectionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

router.post(
  "/jobs/:id/schedule/confirm",
  requireAuth,
  requireRole("accounts", "head_office_admin"),
  async (req: AuthenticatedRequest, res) => {
    try {
      const jobId = parseInt(String(req.params.id), 10);
      const parsed = confirmSchema.safeParse(req.body ?? {});
      if (isNaN(jobId) || !parsed.success) {
        res.status(400).json({ message: "Invalid confirmation data" });
        return;
      }
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      if (!job) {
        res.status(404).json({ message: "Job not found" });
        return;
      }
      if (job.scheduleStatus !== "proposed") {
        res.status(400).json({ message: "No proposed schedule to confirm on this job" });
        return;
      }
      const finalDate = parsed.data.collectionDate || job.proposedCollectionDate;
      if (!finalDate || !job.driverName || !job.vehicleReg) {
        res.status(400).json({ message: "The collection company has not proposed a complete schedule yet" });
        return;
      }

      const [updated] = await db
        .update(jobsTable)
        .set({
          collectionDate: finalDate,
          scheduleStatus: "confirmed",
          status: advanceJobStatusSql("confirmed"),
        })
        .where(eq(jobsTable.id, jobId))
        .returning();

      let locationAddress: string | null = null;
      if (job.locationId) {
        const [loc] = await db
          .select({ address: locationsTable.address })
          .from(locationsTable)
          .where(eq(locationsTable.id, job.locationId));
        if (loc) locationAddress = loc.address;
      }
      const siteAddress = job.collectionPoint || locationAddress || job.depot;

      const jobRef: JobRef = {
        id: job.id,
        reference: job.reference,
        clientName: job.clientName,
        depot: job.depot,
        collectionDate: finalDate,
        tonnage: job.tonnage,
        submittedById: job.submittedById,
      };
      notifySiteContactScheduleConfirmed(jobRef, {
        collectionDate: finalDate,
        driverName: job.driverName,
        vehicleReg: job.vehicleReg,
        siteAddress,
        siteHours: job.siteHours,
        siteContacts: job.siteContacts,
        specialInstructions: job.specialInstructions,
      }).catch((err) => console.error("Failed to send site contact confirmation:", err));

      res.json({ job: updated });
    } catch (error) {
      console.error("Confirm schedule error:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  }
);

export default router;
