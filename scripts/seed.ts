import { db } from "@workspace/db";
import { usersTable, systemSettingsTable, batteryWeightReferenceTable, cellModelsTable, collectionPointsTable, lmePricesTable } from "@workspace/db/schema";
import { sql } from "drizzle-orm";
import bcrypt from "bcrypt";
import { CELL_MODEL_DATA } from "@workspace/db/data/cell-models";

async function seed() {
  const password = await bcrypt.hash("password123", 10);

  const users = [
    { email: "depot@itinium.co.uk", fullName: "Dave Mitchell", role: "depot_user", depot: "Birmingham Central" },
    { email: "team@itinium.co.uk", fullName: "Sarah Cooper", role: "team_leader", depot: "Birmingham Central" },
    { email: "accounts@itinium.co.uk", fullName: "Rachel Adams", role: "accounts", depot: null },
    { email: "admin@itinium.co.uk", fullName: "Sarah Mitchell", role: "head_office_admin", depot: null },
    { email: "alex.j@greenfield.co.uk", fullName: "Alex Johnson", role: "depot_user", depot: "Birmingham Central" },
    { email: "t.whitaker@metrowaste.co.uk", fullName: "Tom Whitaker", role: "team_leader", depot: "Manchester North" },
    { email: "j.patel@ecocollect.co.uk", fullName: "James Patel", role: "depot_user", depot: "Leeds Hub" },
    { email: "e.clarke@cleanpower.co.uk", fullName: "Emma Clarke", role: "depot_user", depot: "Bristol South" },
    { email: "d.osei@thamesbatt.co.uk", fullName: "David Osei", role: "team_leader", depot: "Reading Central" },
    { email: "p.sharma@nationalgrid.co.uk", fullName: "Priya Sharma", role: "depot_user", depot: "London Depot" },
    { email: "m.thompson@northernenergy.co.uk", fullName: "Mark Thompson", role: "depot_user", depot: "Sheffield East" },
    { email: "l.chen@itinium.co.uk", fullName: "Lisa Chen", role: "accounts", depot: null },
  ];

  for (const u of users) {
    await db
      .insert(usersTable)
      .values({ ...u, passwordHash: password })
      .onConflictDoNothing();
  }

  console.log("Seeded 12 demo users (password: password123)");

  await db.insert(systemSettingsTable).values({
    singletonKey: "default",
    companyName: "Itinium Ltd",
    invoicePrefix: "INV",
    dataRetentionDays: 365,
    autoFetchLme: false,
  }).onConflictDoUpdate({
    target: systemSettingsTable.singletonKey,
    set: { companyName: "Itinium Ltd" },
  });

  console.log("Seeded system settings");

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
  await db.execute(sql`ALTER TABLE job_batteries ADD COLUMN IF NOT EXISTS is_loose_cells BOOLEAN DEFAULT FALSE`);
  await db.execute(sql`ALTER TABLE job_batteries ADD COLUMN IF NOT EXISTS serial_flag_reason VARCHAR(100)`);
  await db.execute(sql`ALTER TABLE job_batteries ADD COLUMN IF NOT EXISTS row_photo TEXT`);

  await db.delete(batteryWeightReferenceTable);
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

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS cell_models (
      id SERIAL PRIMARY KEY,
      manufacturer VARCHAR(100) NOT NULL DEFAULT 'Unknown',
      model_name VARCHAR(100) NOT NULL,
      cell_family VARCHAR(50) NOT NULL,
      cell_height_mm INTEGER NOT NULL,
      cells_count INTEGER NOT NULL,
      weight_per_cell_kg DECIMAL(10,3) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`ALTER TABLE cell_models ADD COLUMN IF NOT EXISTS manufacturer VARCHAR(100) NOT NULL DEFAULT 'Unknown'`);
  await db.execute(sql`ALTER TABLE cell_models ADD COLUMN IF NOT EXISTS pb_content_kg_per_cell DECIMAL(10,3)`);
  await db.execute(sql`ALTER TABLE cell_models DROP CONSTRAINT IF EXISTS cell_models_model_name_unique`);
  await db.execute(sql`DROP INDEX IF EXISTS cell_models_model_name_unique`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_cell_models_model_name`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_cell_models_mfr_model`);
  await db.execute(sql`DROP INDEX IF EXISTS idx_cell_models_mfr_model_height`);

  await db.delete(cellModelsTable);

  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_cell_models_mfr_model ON cell_models (manufacturer, model_name)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cell_models_family ON cell_models (cell_family)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cell_models_family_height ON cell_models (cell_family, cell_height_mm)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cell_models_manufacturer ON cell_models (manufacturer)`);
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
    await db.insert(cellModelsTable).values(batch).onConflictDoNothing();
  }
  const countResult = await db.execute(sql`SELECT COUNT(*)::int as count FROM cell_models`);
  const cellModelCount = Number(countResult.rows?.[0]?.count ?? countResult[0]?.count ?? 0);
  console.log(`Seeded ${cellModelCount} cell model entries (expected ${CELL_MODEL_DATA.length})`);
  if (cellModelCount !== CELL_MODEL_DATA.length) {
    console.warn(`WARNING: Expected ${CELL_MODEL_DATA.length} cell models but inserted ${cellModelCount}. Check for duplicates in data file.`);
  }

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS collection_points (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      address VARCHAR(500) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);

  await db.delete(collectionPointsTable);
  const collectionPoints = [
    { name: "Linde Basingstoke", address: "Linde Material Handling, Mulberry Business Park, Fishers Lane, Cheltenham, Basingstoke RG24 8GF" },
    { name: "Linde Fareham", address: "Linde Material Handling, Unit 7, Segensworth Business Centre, Fareham PO15 5RR" },
    { name: "Linde Immingham", address: "Linde Material Handling, Manby Road, Immingham, North East Lincolnshire DN40 3DZ" },
    { name: "Linde Lincoln", address: "Linde Material Handling, Doddington Road, Lincoln LN6 7HA" },
    { name: "Linde Lutterworth", address: "Linde Material Handling, Magna Park, Coventry Road, Lutterworth LE17 4XN" },
    { name: "Linde Normanton", address: "Linde Material Handling, Unit 2, Wakefield Europort, Normanton WF6 1ZB" },
    { name: "Linde Swindon", address: "Linde Material Handling, Bridgemead Close, Westmead Industrial Estate, Swindon SN5 7YG" },
    { name: "Still Aston", address: "Still Materials Handling, Unit 4, Aston Industrial Estate, Birmingham B6 7EY" },
    { name: "Still Bristol", address: "Still Materials Handling, Western Approach Distribution Park, Severn Beach, Bristol BS35 4GG" },
    { name: "Still Dartford", address: "Still Materials Handling, Crossways Business Park, Dartford DA2 6QE" },
    { name: "Still Glasgow", address: "Still Materials Handling, Cambuslang Investment Park, Glasgow G32 8NB" },
    { name: "Still Manchester", address: "Still Materials Handling, Trafford Park, Manchester M17 1WA" },
    { name: "Still Northampton", address: "Still Materials Handling, Moulton Park Industrial Estate, Northampton NN3 6AQ" },
    { name: "Still Warrington", address: "Still Materials Handling, Woolston Grange Avenue, Warrington WA1 4PQ" },
  ];

  for (const cp of collectionPoints) {
    await db.insert(collectionPointsTable).values(cp).onConflictDoNothing();
  }
  console.log(`Seeded ${collectionPoints.length} collection point presets`);

  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_lme_prices_price_date ON lme_prices (price_date)`);
  await db.insert(lmePricesTable).values({
    priceDate: "2026-04-02",
    usdPrice: "2200.00",
    exchangeRate: "0.790000",
    gbpPrice: "1738.00",
    source: "manual",
  }).onConflictDoNothing();
  console.log("Ensured initial LME price (£1738.00/t, 2026-04-02)");

  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
