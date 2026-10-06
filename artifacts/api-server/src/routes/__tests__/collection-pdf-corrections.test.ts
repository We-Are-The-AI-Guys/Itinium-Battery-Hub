import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express, { type NextFunction, type Response } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { once } from "node:events";
import { inflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  jobsTable, jobBatteriesTable, cellModelsTable, usersTable,
} from "@workspace/db/schema";
import type { AuthenticatedRequest } from "../../middlewares/auth";
import jobsRouter from "../jobs";

const saved = vi.hoisted(() => ({
  job: {} as typeof jobsTable.$inferSelect,
  batteries: [] as (typeof jobBatteriesTable.$inferSelect)[],
}));

vi.mock("@workspace/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => {
        const query = {
          where: () => query,
          for: () => query,
          then: (resolve: (rows: unknown[]) => unknown) => {
            if (table === jobsTable) return Promise.resolve([saved.job]).then(resolve);
            if (table === jobBatteriesTable) return Promise.resolve(saved.batteries).then(resolve);
            if (table === usersTable) return Promise.resolve([{ fullName: "Test Reviewer" }]).then(resolve);
            if (table === cellModelsTable) return Promise.resolve([{
              manufacturer: "TAB", modelName: "5 EPzS 775",
              weightPerCellKg: "32.900", pbContentKgPerCell: "32.900", cellsCount: 5,
            }]).then(resolve);
            throw new Error("Unexpected database read in PDF correction test");
          },
        };
        return query;
      },
    }),
    update: (table: unknown) => ({
      set: (updates: Record<string, unknown>) => ({
        where: () => ({
          returning: async () => {
            if (table === jobBatteriesTable) {
              Object.assign(saved.batteries[0], updates);
              return [saved.batteries[0]];
            }
            if (table === jobsTable) {
              Object.assign(saved.job, updates);
              return [saved.job];
            }
            throw new Error("Unexpected database update in PDF correction test");
          },
        }),
      }),
    }),
    insert: () => ({ values: async () => [] }),
    transaction: async (callback: (tx: unknown) => unknown) => {
      const { db } = await import("@workspace/db");
      return callback(db);
    },
  },
}));

vi.mock("../../middlewares/auth", async () => {
  const actual = await vi.importActual<typeof import("../../middlewares/auth")>("../../middlewares/auth");
  return {
    ...actual,
    requireAuth: (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
      req.user = {
        id: 7, role: "head_office_admin", fullName: "Test Reviewer",
        email: "pdf-review@example.invalid", clientId: null,
        locationId: null, depot: null, collectionCompanyId: null,
      };
      next();
    },
  };
});

vi.mock("../../lib/notifications", () => ({
  notifyAdminsNewJob: vi.fn(async () => {}),
  notifyAdminsFlaggedBatteries: vi.fn(async () => {}),
  notifySubmitterStatusChange: vi.fn(async () => {}),
  notifyFlagResolved: vi.fn(async () => {}),
  notifyCollectionCompanyNewJob: vi.fn(async () => {}),
  sendCompletedReceiptToClient: vi.fn(async () => {}),
  sendJobValueToAccounts: vi.fn(async () => {}),
}));

// PDFKit text fragments can be interleaved across columns; inspect tokens,
// not an assumed contiguous extracted row sentence.
function pdfText(pdf: Buffer): string {
  const source = pdf.toString("latin1");
  const blocks: string[] = [];
  let cursor = 0;
  while (true) {
    const marker = source.indexOf("stream\n", cursor);
    if (marker < 0) break;
    const start = marker + 7;
    const end = source.indexOf("endstream", start);
    if (end < 0) break;
    let compressed = pdf.subarray(start, end);
    if (compressed.at(-1) === 10) compressed = compressed.subarray(0, -1);
    try {
      const content = inflateSync(compressed).toString("latin1");
      for (const object of content.matchAll(/BT([\s\S]*?)ET/g)) {
        blocks.push([...object[1].matchAll(/<([0-9a-f]+)>/gi)]
          .map((match) => Buffer.from(match[1], "hex").toString("latin1")).join(""));
      }
    } catch {
      // Images and other non-text streams cannot be decoded as text.
    }
    cursor = end + 9;
  }
  return blocks.join(" ").replace(/\s+/g, " ");
}

let server: Server;
let origin: string;
beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api", jobsRouter);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
beforeEach(() => {
  saved.job = {
    id: 901, reference: "PDF-TEST-901", clientName: "Synthetic Client", depot: "Synthetic Depot",
    collectionPoint: "Synthetic Loading Bay", collectionDate: "2026-10-05",
    locationId: null, tonnage: "0.700", tonnageManualOverride: false,
    siteContacts: "Synthetic Site Team", siteHours: "09:00–17:00",
    specialInstructions: "Corrected loading instructions", driverName: "Test Driver",
    vehicleReg: "TEST-901", cblLmeValue: null,
    customerTractionRate: null, customerInvoiceNo: null,
  } as typeof jobsTable.$inferSelect;
  saved.batteries = [{
    id: 902, jobId: 901, palletNumber: "P-001", assetNumber: "ASSET-OLD",
    batterySerial: "SERIAL-OLD", manufacture: "OldMaker", cellType: "OldModel",
    voltage: "48V", isLooseCells: false, looseCellsQty: null,
    notes: "OldNote", adminNotes: null,
    receiptConfirmed: true, receiptReviewed: true, estimatedWeightKg: "700.000",
    weightManual: false, pbContentKg: null, valueGbp: null,
    serialFlagReason: "Unknown", manufacturerFlagReason: "Unknown",
    cellModelFlagReason: "Unknown", voltageFlagReason: "Unknown",
    resolvedById: null, resolvedAt: null,
  } as typeof jobBatteriesTable.$inferSelect];
});

async function download(endpoint: string) {
  const response = await fetch(`${origin}/api/jobs/901/${endpoint}`);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/pdf");
  expect(response.headers.get("content-disposition")).toContain("attachment");
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, text: pdfText(bytes) };
}

async function saveCorrection(updates: Record<string, unknown>) {
  const response = await fetch(`${origin}/api/jobs/901/batteries/902/admin`, {
    method: "PATCH", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      batterySerial: "SERIAL-NEW", assetNumber: "ASSET-NEW",
      manufacture: "TAB", cellType: "5 EPzS 775", voltage: "24V",
      notes: "SavedNote", pbContentKg: "394.800", valueGbp: "0", ...updates,
    }),
  });
  expect(response.status).toBe(200);
  return await response.json() as {
    battery: typeof jobBatteriesTable.$inferSelect;
    job?: typeof jobsTable.$inferSelect;
  };
}

describe("both collection PDF downloads use saved corrections", () => {
  it("accepts legacy Unknown manufacturers without requiring review and uses TAB on save", async () => {
    saved.batteries[0].manufacture = "Unknown";
    saved.batteries[0].manufacturerFlagReason = "Missing from CSV";
    const response = await fetch(`${origin}/api/jobs/901`);
    expect(response.status).toBe(200);
    const details = await response.json() as {
      batteries: (typeof jobBatteriesTable.$inferSelect)[];
    };
    expect(details.batteries[0].manufacture).toBe("Unknown");
    expect(details.batteries[0].manufacturerFlagReason).toBeNull();
    expect(details.batteries[0].cellModelFlagReason).toBe("Unknown");
    // Reading an existing job must not mutate its stored data.
    expect(saved.batteries[0].manufacturerFlagReason).toBe("Missing from CSV");

    const corrected = await saveCorrection({ manufacture: "Unknown" });
    expect(corrected.battery.manufacture).toBe("Unknown");
    expect(corrected.battery.manufacturerFlagReason).toBeNull();
    expect(corrected.battery.estimatedWeightKg).toBe("552.720");
  });

  it("regenerates both PDFs after a real correction handler saves the new row", async () => {
    for (const endpoint of ["collection-sheet.pdf", "invoice.pdf"]) {
      const before = await download(endpoint);
      expect(before.text).toContain("OldMaker");
      expect(before.text).toContain("OldModel");
    }
    const result = await saveCorrection({});
    // 24V = 12 cells; catalogue 32.9kg × 12 × 1.4 safe-load.
    expect(result.battery.estimatedWeightKg).toBe("552.720");
    expect(saved.job.tonnage).toBe("0.553");

    for (const endpoint of ["collection-sheet.pdf", "invoice.pdf"]) {
      const after = await download(endpoint);
      for (const value of ["SERIAL-NEW", "ASSET-NEW", "TAB", "5 EPzS 775", "24V", "SavedNote"]) {
        expect(after.text).toContain(value);
      }
      for (const value of ["OldMaker", "OldModel", "SERIAL-OLD", "ASSET-OLD", "48V", "OldNote"]) {
        expect(after.text).not.toContain(value);
      }
      if (endpoint === "collection-sheet.pdf") expect(after.text).toContain("c 0.6t");
      // Optional disposable samples for visual checks, never real job data.
      if (process.env.PDF_TEST_OUTPUT_DIR) {
        mkdirSync(process.env.PDF_TEST_OUTPUT_DIR, { recursive: true });
        writeFileSync(join(process.env.PDF_TEST_OUTPUT_DIR, endpoint), after.bytes);
      }
    }
  });

  it("uses the saved loose-cell quantity and does not apply the safety factor twice", async () => {
    saved.batteries[0].isLooseCells = true;
    saved.batteries[0].voltage = null;
    saved.batteries[0].looseCellsQty = 99;
    const result = await saveCorrection({ voltage: null, looseCellsQty: 13, pbContentKg: "427.700" });
    expect(result.battery.estimatedWeightKg).toBe("598.780");
    for (const endpoint of ["collection-sheet.pdf", "invoice.pdf"]) {
      const after = await download(endpoint);
      expect(after.text).toContain("13");
      expect(after.text).not.toContain("99");
      expect(after.text).toContain("5 EPzS 775");
    }
  });

  it("preserves deliberately overridden tonnage and protected manual row weights", async () => {
    saved.job.tonnageManualOverride = true;
    saved.job.tonnage = "2.500";
    saved.batteries[0].weightManual = true;
    saved.batteries[0].estimatedWeightKg = "888.000";
    const result = await saveCorrection({});
    expect(result.battery.estimatedWeightKg).toBe("888.000");
    expect(saved.job.tonnage).toBe("2.500");
    expect((await download("collection-sheet.pdf")).text).toContain("c 2.5t");
    expect((await download("invoice.pdf")).text).toContain("SERIAL-NEW");
  });
});
