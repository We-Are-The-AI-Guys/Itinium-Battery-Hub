import { db } from "@workspace/db";
import { usersTable, systemSettingsTable, batteryWeightReferenceTable, cellModelsTable, collectionPointsTable, lmePricesTable, clientsTable, locationsTable } from "@workspace/db/schema";
import { sql, eq } from "drizzle-orm";
import bcrypt from "bcrypt";
import { CELL_MODEL_DATA } from "@workspace/db/data/cell-models";

async function seed() {
  const password = await bcrypt.hash("password123", 10);

  await db.execute(sql`UPDATE jobs SET status = 'request' WHERE status = 'pending'`);
  await db.execute(sql`UPDATE jobs SET status = 'confirmed' WHERE status = 'approved'`);
  await db.execute(sql`UPDATE jobs SET status = 'request' WHERE status = 'flagged'`);
  await db.execute(sql`ALTER TABLE jobs ALTER COLUMN status SET DEFAULT 'request'`);

  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS clients (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      contact_name VARCHAR(255),
      contact_email VARCHAR(255),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS locations (
      id SERIAL PRIMARY KEY,
      client_id INTEGER NOT NULL REFERENCES clients(id),
      name VARCHAR(255) NOT NULL,
      address VARCHAR(500),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL
    )
  `);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_locations_client_id ON locations(client_id)`);
  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_locations_client_name ON locations(client_id, name)`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id)`);
  await db.execute(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id)`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS client_id INTEGER REFERENCES clients(id)`);
  await db.execute(sql`ALTER TABLE jobs ADD COLUMN IF NOT EXISTS location_id INTEGER REFERENCES locations(id)`);

  const CANONICAL_USER_EMAILS = [
    "admin@itinium.co.uk",
    "accounts@itinium.co.uk",
    "l.chen@itinium.co.uk",
    "team@itinium.co.uk",
    "depot@itinium.co.uk",
  ];
  const CANONICAL_CLIENT_NAMES = ["Linde"];
  const CANONICAL_LOCATION_NAMES = [
    "Linde South East (Camberley)",
    "Linde South (Bridgend)",
    "Linde East (Hoddesdon)",
    "Linde Creighton (West Bromwich)",
    "Linde Warrington",
    "Linde Castleford",
    "Linde Newton Aycliffe",
    "Linde East Kilbride",
    "Linde Basingstoke (Kingsclare Road)",
    "CM - Jewsbury (Castleford)",
    "Still Exeter",
    "Linde MH South (Swanley)",
    "Linde Wellingborough",
    "Linde Andover",
    "Linde Basingstoke (Pelton Road)",
  ];

  const canonicalEmailList = sql.join(CANONICAL_USER_EMAILS.map((e) => sql`${e}`), sql`, `);
  const canonicalLocationList = sql.join(CANONICAL_LOCATION_NAMES.map((n) => sql`${n}`), sql`, `);
  const canonicalClientList = sql.join(CANONICAL_CLIENT_NAMES.map((n) => sql`${n}`), sql`, `);

  await db.execute(sql`DELETE FROM job_batteries`);
  await db.execute(sql`DELETE FROM stillage_movements`);
  await db.execute(sql`DELETE FROM jobs`);
  await db.execute(sql`DELETE FROM job_drafts`);
  await db.execute(sql`DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email NOT IN (${canonicalEmailList}))`);
  await db.execute(sql`DELETE FROM password_reset_tokens WHERE user_id IN (SELECT id FROM users WHERE email NOT IN (${canonicalEmailList}))`);
  await db.execute(sql`DELETE FROM users WHERE email NOT IN (${canonicalEmailList})`);
  await db.execute(sql`DELETE FROM locations WHERE name NOT IN (${canonicalLocationList})`);
  await db.execute(sql`DELETE FROM clients WHERE name NOT IN (${canonicalClientList})`);
  console.log("Purged non-canonical clients, locations, users, jobs, drafts, and movements");

  const sampleClients = [
    { name: "Linde", contactName: null, contactEmail: null },
  ];

  const clientIds: Record<string, number> = {};
  for (const c of sampleClients) {
    const [inserted] = await db
      .insert(clientsTable)
      .values(c)
      .onConflictDoNothing()
      .returning({ id: clientsTable.id });
    if (inserted) {
      clientIds[c.name] = inserted.id;
    } else {
      const [existing] = await db.select({ id: clientsTable.id }).from(clientsTable).where(eq(clientsTable.name, c.name));
      if (existing) clientIds[c.name] = existing.id;
    }
  }
  console.log(`Seeded ${Object.keys(clientIds).length} clients`);

  const sampleLocations = [
    { clientName: "Linde", name: "Linde South East (Camberley)", address: "Linde South East, Camberley, Surrey, GU15 3BU" },
    { clientName: "Linde", name: "Linde South (Bridgend)", address: "Linde South, North Road, Bridgend Industrial Estate, Bridgend, Mid Glamorgan, CF31 3SZ" },
    { clientName: "Linde", name: "Linde East (Hoddesdon)", address: "Linde East, Hoddesdon, Herts, EN11 0DJ" },
    { clientName: "Linde", name: "Linde Creighton (West Bromwich)", address: "Linde Creighton Ltd, Radial Point, Dartmouth Road, West Bromwich, West Midlands. B66 1BG" },
    { clientName: "Linde", name: "Linde Warrington", address: "Linde MH UK Ltd, Winwick Road, Warrington, Cheshire, WA2 8JF" },
    { clientName: "Linde", name: "Linde Castleford", address: "Linde MH UK Ltd, Pioneer Way, Castleford, West Yorkshire, WF10 5QU" },
    { clientName: "Linde", name: "Linde Newton Aycliffe", address: "Linde MH UK Ltd, Linde Way, Aycliffe Business Park, Newton Aycliffe, Co. Durham, DL5 6HR" },
    { clientName: "Linde", name: "Linde East Kilbride", address: "Linde MH UK Ltd, 3 Milton Road, East Kilbride, Scotland, G74, 5BU" },
    { clientName: "Linde", name: "Linde Basingstoke (Kingsclare Road)", address: "Linde MH UK Ltd, Gate 2, Kingsclare Road, Basingstoke, RG21 6XJ" },
    { clientName: "Linde", name: "CM - Jewsbury (Castleford)", address: "CM - Jewsbury, WF10 5QU" },
    { clientName: "Linde", name: "Still Exeter", address: "Still Materials Handling Ltd, Jacks Way, Hill Barton Business Park, Clyst St Mary, Exeter, EX5 1FG" },
    { clientName: "Linde", name: "Linde MH South (Swanley)", address: "Linde MH South, Unit 5 & 6 The Interchange, Westead Lane, Swanley, Kent. BR8 8TE" },
    { clientName: "Linde", name: "Linde Wellingborough", address: "Linde MH UK LTD, 6-8 Patterson Road, Wellingborough. NN8 4EX" },
    { clientName: "Linde", name: "Linde Andover", address: "Linde MH UK Ltd, Co-operative Food Primary Logistics Services, 4 Andover Business Park, Pioneer Rd, Andover, SP11 8EZ" },
    { clientName: "Linde", name: "Linde Basingstoke (Pelton Road)", address: "Linde MH UK Ltd, Pelton Road, Basingstoke, RG21 6XD" },
  ];

  const locationIds: Record<string, number> = {};
  for (const loc of sampleLocations) {
    const cId = clientIds[loc.clientName];
    if (!cId) continue;
    const existing = await db.select({ id: locationsTable.id }).from(locationsTable)
      .where(sql`${locationsTable.clientId} = ${cId} AND ${locationsTable.name} = ${loc.name}`);
    if (existing.length > 0) {
      locationIds[loc.name] = existing[0].id;
    } else {
      const [inserted] = await db.insert(locationsTable).values({
        clientId: cId,
        name: loc.name,
        address: loc.address,
      }).returning({ id: locationsTable.id });
      if (inserted) locationIds[loc.name] = inserted.id;
    }
  }
  console.log(`Seeded ${Object.keys(locationIds).length} locations`);

  const users = [
    { email: "admin@itinium.co.uk", fullName: "Sarah Mitchell", role: "head_office_admin", depot: null, clientId: null, locationId: null },
    { email: "accounts@itinium.co.uk", fullName: "Rachel Adams", role: "accounts", depot: null, clientId: null, locationId: null },
    { email: "l.chen@itinium.co.uk", fullName: "Lisa Chen", role: "accounts", depot: null, clientId: null, locationId: null },
    { email: "team@itinium.co.uk", fullName: "Sarah Cooper", role: "team_leader", depot: "Linde South East (Camberley)", clientName: "Linde", locationName: null },
    { email: "depot@itinium.co.uk", fullName: "Dave Mitchell", role: "depot_user", depot: "Linde South East (Camberley)", clientName: "Linde", locationName: "Linde South East (Camberley)" },
  ];

  for (const u of users) {
    const clientName = "clientName" in u ? (u as Record<string, unknown>).clientName as string | null : null;
    const locationName = "locationName" in u ? (u as Record<string, unknown>).locationName as string | null : null;
    const cId = clientName ? clientIds[clientName] || null : null;
    const lId = locationName ? locationIds[locationName] || null : null;

    const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, u.email));
    if (existing) {
      await db.update(usersTable).set({
        clientId: cId,
        locationId: lId,
        depot: u.depot,
        role: u.role,
      }).where(eq(usersTable.id, existing.id));
    } else {
      await db.insert(usersTable).values({
        email: u.email,
        fullName: u.fullName,
        role: u.role,
        depot: u.depot,
        clientId: cId,
        locationId: lId,
        passwordHash: password,
      });
    }
  }

  console.log(`Seeded ${users.length} demo users with client/location assignments (password: password123)`);

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

  await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_cell_models_mfr_model ON cell_models (manufacturer, model_name)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cell_models_family ON cell_models (cell_family)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cell_models_family_height ON cell_models (cell_family, cell_height_mm)`);
  await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cell_models_manufacturer ON cell_models (manufacturer)`);
  await db.delete(cellModelsTable);
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

  for (const cp of collectionPoints) {
    await db.insert(collectionPointsTable).values(cp).onConflictDoNothing();
  }
  console.log(`Seeded ${collectionPoints.length} collection point presets`);

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
