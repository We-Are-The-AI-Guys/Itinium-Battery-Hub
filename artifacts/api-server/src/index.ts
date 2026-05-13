import app from "./app";
import { db } from "@workspace/db";
import { usersTable, systemSettingsTable, batteryWeightReferenceTable, cellModelsTable, collectionPointsTable, notificationsTable } from "@workspace/db/schema";
import { count, sql, lt } from "drizzle-orm";
import bcrypt from "bcrypt";
import { CELL_MODEL_DATA } from "@workspace/db/data/cell-models";

async function bootstrap() {
  try {
    await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS pallet_number_seq START WITH 1 INCREMENT BY 1`);
  } catch (err) {
    console.error("Bootstrap: failed to create pallet_number_seq:", err);
  }

  try {
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_job_batteries_pallet_number ON job_batteries (pallet_number) WHERE pallet_number IS NOT NULL`);
  } catch (err) {
    console.error("Bootstrap: failed to create pallet_number unique index:", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS battery_weight_reference (
        id SERIAL PRIMARY KEY,
        cell_type VARCHAR(50) NOT NULL,
        voltage VARCHAR(50),
        weight_kg DECIMAL(10,3) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_bwr_cell_voltage_notnull ON battery_weight_reference (cell_type, voltage) WHERE voltage IS NOT NULL`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_bwr_cell_voltage_null ON battery_weight_reference (cell_type) WHERE voltage IS NULL`);
    await db.execute(sql`ALTER TABLE job_batteries ADD COLUMN IF NOT EXISTS estimated_weight_kg DECIMAL(10,3)`);
  } catch (err) {
    console.error("Bootstrap: failed to create weight reference table:", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS cell_models (
        id SERIAL PRIMARY KEY,
        model_name VARCHAR(100) NOT NULL UNIQUE,
        cell_family VARCHAR(50) NOT NULL,
        cell_height_mm INTEGER NOT NULL,
        cells_count INTEGER NOT NULL,
        weight_per_cell_kg DECIMAL(10,3) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cell_models_family ON cell_models (cell_family)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cell_models_family_height ON cell_models (cell_family, cell_height_mm)`);
    await db.execute(sql`ALTER TABLE job_batteries ALTER COLUMN cell_type TYPE VARCHAR(100)`);
    await db.execute(sql`ALTER TABLE cell_models ADD COLUMN IF NOT EXISTS pb_content_kg_per_cell DECIMAL(10,3)`);
  } catch (err) {
    console.error("Bootstrap: failed to create cell_models table:", err);
  }

  try {
    const [{ value: userCount }] = await db.select({ value: count() }).from(usersTable);
    if (userCount === 0) {
      console.log("No users found — creating default users...");
      const hash = await bcrypt.hash("password123", 10);
      const users = [
        { email: "depot@itinium.co.uk", fullName: "Dave Mitchell", role: "depot_user", depot: "Birmingham Central" },
        { email: "team@itinium.co.uk", fullName: "Sarah Cooper", role: "team_leader", depot: "Birmingham Central" },
        { email: "accounts@itinium.co.uk", fullName: "Rachel Adams", role: "accounts", depot: null },
        { email: "admin@itinium.co.uk", fullName: "Sarah Mitchell", role: "head_office_admin", depot: null },
      ];
      for (const u of users) {
        await db.insert(usersTable).values({ ...u, passwordHash: hash }).onConflictDoNothing();
      }
      console.log("Default users created (4 accounts)");
    }
  } catch (err) {
    console.error("Bootstrap: failed to init default users:", err);
  }

  try {
    const [{ value: settingsCount }] = await db.select({ value: count() }).from(systemSettingsTable);
    if (settingsCount === 0) {
      await db.insert(systemSettingsTable).values({
        companyName: "Itinium Ltd",
        invoicePrefix: "INV",
        dataRetentionDays: 365,
        autoFetchLme: false,
      });
      console.log("Default system settings created");
    }
  } catch (err) {
    console.error("Bootstrap: failed to init system settings:", err);
  }

  try {
    const [{ value: weightRefCount }] = await db.select({ value: count() }).from(batteryWeightReferenceTable);
    if (weightRefCount === 0) {
      const weightRefs = [
        { cellType: "PZB", voltage: "12V", weightKg: "180.000" },
        { cellType: "PZB", voltage: "24V", weightKg: "360.000" },
        { cellType: "PZB", voltage: "36V", weightKg: "540.000" },
        { cellType: "PZB", voltage: "40V", weightKg: "600.000" },
        { cellType: "PZB", voltage: "48V", weightKg: "720.000" },
        { cellType: "PZB", voltage: "80V", weightKg: "1200.000" },
        { cellType: "PZB", voltage: "96V", weightKg: "1440.000" },
        { cellType: "PZS", voltage: "12V", weightKg: "200.000" },
        { cellType: "PZS", voltage: "24V", weightKg: "400.000" },
        { cellType: "PZS", voltage: "36V", weightKg: "600.000" },
        { cellType: "PZS", voltage: "40V", weightKg: "665.000" },
        { cellType: "PZS", voltage: "48V", weightKg: "800.000" },
        { cellType: "PZS", voltage: "80V", weightKg: "1330.000" },
        { cellType: "PZS", voltage: "96V", weightKg: "1600.000" },
        { cellType: "PZV", voltage: "12V", weightKg: "170.000" },
        { cellType: "PZV", voltage: "24V", weightKg: "340.000" },
        { cellType: "PZV", voltage: "36V", weightKg: "510.000" },
        { cellType: "PZV", voltage: "40V", weightKg: "565.000" },
        { cellType: "PZV", voltage: "48V", weightKg: "680.000" },
        { cellType: "PZV", voltage: "80V", weightKg: "1130.000" },
        { cellType: "PZV", voltage: "96V", weightKg: "1360.000" },
        { cellType: "Blocs", voltage: null, weightKg: "25.000" },
        { cellType: "Other", voltage: null, weightKg: "0.000" },
      ];
      for (const wr of weightRefs) {
        await db.insert(batteryWeightReferenceTable).values(wr).onConflictDoNothing();
      }
      console.log(`Seeded ${weightRefs.length} battery weight references`);
    }
  } catch (err) {
    console.error("Bootstrap: failed to seed weight references:", err);
  }

  try {
    await db.execute(sql`ALTER TABLE cell_models ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100) NOT NULL DEFAULT 'Unknown'`);
    await db.execute(sql`DROP INDEX IF EXISTS cell_models_model_name_unique`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_cell_models_mfr_model ON cell_models (manufacturer, model_name)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cell_models_family ON cell_models (cell_family)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cell_models_family_height ON cell_models (cell_family, cell_height_mm)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cell_models_manufacturer ON cell_models (manufacturer)`);
    console.log("Refreshing cell models from canonical data...");
    await db.transaction(async (tx) => {
      await tx.delete(cellModelsTable);
      const batchSize = 50;
      for (let i = 0; i < CELL_MODEL_DATA.length; i += batchSize) {
        const batch = CELL_MODEL_DATA.slice(i, i + batchSize).map(cm => ({
          manufacturer: cm.manufacturer,
          modelName: cm.modelName,
          cellFamily: cm.cellFamily,
          cellHeightMm: cm.cellHeightMm,
          cellsCount: cm.cellsCount,
          weightPerCellKg: String(cm.weightPerCellKg),
          pbContentKgPerCell: cm.pbContentKgPerCell != null ? String(cm.pbContentKgPerCell) : null,
        }));
        await tx.insert(cellModelsTable).values(batch).onConflictDoNothing();
      }
    });
    const [{ value: cellModelCount }] = await db.select({ value: count() }).from(cellModelsTable);
    console.log(`Refreshed cell models: ${cellModelCount} entries (expected ${CELL_MODEL_DATA.length})`);
  } catch (err) {
    console.error("Bootstrap: failed to refresh cell models:", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS job_drafts (
        id SERIAL PRIMARY KEY,
        saved_by_id INTEGER NOT NULL REFERENCES users(id),
        depot VARCHAR(255) NOT NULL,
        client_id INTEGER REFERENCES clients(id),
        location_id INTEGER REFERENCES locations(id),
        form_data JSONB NOT NULL,
        collection_point VARCHAR(255),
        battery_count INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_job_drafts_saved_by ON job_drafts (saved_by_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_job_drafts_depot_client ON job_drafts (depot, client_id)`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_job_drafts_client ON job_drafts (client_id)`);
  } catch (err) {
    console.error("Bootstrap: failed to create job_drafts table:", err);
  }

  try {
    await db.execute(sql`ALTER TABLE job_drafts ALTER COLUMN form_data TYPE JSONB USING form_data::jsonb`);
  } catch {
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS notifications (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        body TEXT NOT NULL,
        link VARCHAR(500),
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created ON notifications (user_id, is_read, created_at)`);
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const pruneResult = await db.delete(notificationsTable).where(lt(notificationsTable.createdAt, cutoff));
    const pruned = (pruneResult as { rowCount?: number }).rowCount ?? 0;
    if (pruned > 0) console.log(`[notifications] Pruned ${pruned} notifications older than 90 days`);
  } catch (err) {
    console.error("Bootstrap: failed to create/prune notifications table:", err);
  }

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS collection_points (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        address VARCHAR(500) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      )
    `);
    const collectionPoints = [
      { name: "Linde South East (Camberley)", address: "Linde South East, Camberley, Surrey, GU15 3BU" },
      { name: "Linde South (Bridgend)", address: "Linde South, North Road, Bridgend Industrial Estate, Bridgend, Mid Glamorgan, CF31 3SZ" },
      { name: "Linde East (Hoddesdon)", address: "Linde East, Hoddesdon, Herts, EN11 0DJ" },
      { name: "Linde Creighton (West Bromwich)", address: "Linde Creighton Ltd, Radial Point, Dartmouth Road, West Bromwich, West Midlands. B66 1BG" },
      { name: "Linde Warrington", address: "Linde MH UK Ltd, Winwick Road, Warrington, Cheshire, WA2 8JF" },
      { name: "Linde Castleford", address: "Linde MH UK Ltd, Pioneer Way, Castleford, West Yorkshire, WF10 5QU" },
      { name: "Linde Newton Aycliffe", address: "Linde MH UK Ltd, Linde Way, Aycliffe Business Park, Newton Aycliffe, Co. Durham, DL5 6HR" },
      { name: "Linde East Kilbride", address: "Linde MH UK Ltd, 3 Milton Road, East Kilbride, Scotland, G74, 5BU" },
      { name: "Linde Basingstoke (Kingsclare Road)", address: "Linde MH UK Ltd, Gate 2, Kingsclare Road, Basingstoke, RG21 6XJ" },
      { name: "CM - Jewsbury (Castleford)", address: "CM - Jewsbury, WF10 5QU" },
      { name: "Still Exeter", address: "Still Materials Handling Ltd, Jacks Way, Hill Barton Business Park, Clyst St Mary, Exeter, EX5 1FG" },
      { name: "Linde MH South (Swanley)", address: "Linde MH South, Unit 5 & 6 The Interchange, Westead Lane, Swanley, Kent. BR8 8TE" },
      { name: "Linde Wellingborough", address: "Linde MH UK LTD, 6-8 Patterson Road, Wellingborough. NN8 4EX" },
      { name: "Linde Andover", address: "Linde MH UK Ltd, Co-operative Food Primary Logistics Services, 4 Andover Business Park, Pioneer Rd, Andover, SP11 8EZ" },
      { name: "Linde Basingstoke (Pelton Road)", address: "Linde MH UK Ltd, Pelton Road, Basingstoke, RG21 6XD" },
    ];
    console.log("Refreshing collection point presets from canonical data...");
    await db.transaction(async (tx) => {
      await tx.delete(collectionPointsTable);
      for (const cp of collectionPoints) {
        await tx.insert(collectionPointsTable).values(cp).onConflictDoNothing();
      }
    });
    console.log(`Refreshed ${collectionPoints.length} collection point presets`);
  } catch (err) {
    console.error("Bootstrap: failed to refresh collection points:", err);
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

bootstrap().then(() => {
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
});
