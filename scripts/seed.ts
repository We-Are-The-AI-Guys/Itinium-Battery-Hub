import { db } from "@workspace/db";
import { usersTable, jobsTable, jobBatteriesTable, lmePricesTable, systemSettingsTable, batteryWeightReferenceTable } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcrypt";

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

  const [depotUser] = await db.select().from(usersTable).where(eq(usersTable.email, "depot@itinium.co.uk"));
  const [teamUser] = await db.select().from(usersTable).where(eq(usersTable.email, "team@itinium.co.uk"));
  const submitterIds = [depotUser?.id, teamUser?.id].filter(Boolean);
  function pickSubmitter(index: number) {
    return submitterIds.length > 0 ? submitterIds[index % submitterIds.length] : undefined;
  }

  const jobsData = [
    {
      reference: "JOB-2026-00847", clientName: "Greenfield Recycling", depot: "Birmingham Central", collectionPoint: "Unit 4, Aston Industrial Estate", collectionDate: "2026-03-15", submittedAt: new Date("2026-03-15"), tonnage: "2.400", status: "pending", invoiceStatus: "pending_invoice", lmeRateUsed: "1724.30", calculatedValue: "4138.32",
      batteries: [
        { assetNumber: "AST-2026-847", batterySerial: "BSN-GR-001", manufacture: "Enersys", cellType: "PZB", voltage: "24V", notes: null },
        { assetNumber: "AST-2026-848", batterySerial: "BSN-GR-002", manufacture: "Hawker", cellType: "PZS", voltage: "48V", notes: null },
        { assetNumber: null, batterySerial: null, manufacture: "GNB", cellType: "Blocs", looseCellsQty: 12, notes: "Mixed loose cells from forklift decommission" },
      ],
    },
    {
      reference: "JOB-2026-00846", clientName: "Metro Waste Solutions", depot: "Manchester North", collectionPoint: "Trafford Park Depot", collectionDate: "2026-03-14", submittedAt: new Date("2026-03-14"), tonnage: "1.800", status: "approved", invoiceStatus: "invoiced", lmeRateUsed: "1724.30", calculatedValue: "3103.74", cblLmeValue: "1724.30", cblLmePercent: "72.50", cblLmePrice: "2250.22", transportCost: "290.00", customerInvoiceValue: "3103.74", customerInvoiceNo: "INV-2026-0846", cblWasteAdviceNoteNo: "WAN-846", cblDate: "2026-03-16", totalInvoiceValue: "3103.74", grossProfit: "563.52",
      batteries: [
        { assetNumber: "AST-2026-846", batterySerial: "BSN-MW-002", manufacture: "Enersys", cellType: "PZB", voltage: "24V", notes: null },
        { assetNumber: "AST-2026-849", batterySerial: "BSN-MW-003", manufacture: "Hoppecke", cellType: "PZV", voltage: "80V", notes: null },
      ],
    },
    {
      reference: "JOB-2026-00845", clientName: "EcoCollect Ltd", depot: "Leeds Hub", collectionPoint: "Cross Green Lane Warehouse", collectionDate: "2026-03-14", submittedAt: new Date("2026-03-14"), tonnage: "3.100", status: "completed", invoiceStatus: "paid", lmeRateUsed: "1724.30", calculatedValue: "5345.33", cblLmeValue: "1724.30", cblLmePercent: "72.50", cblLmePrice: "3876.77", transportCost: "450.00", customerInvoiceValue: "5345.33", customerInvoiceNo: "INV-2026-0845", cblWasteAdviceNoteNo: "WAN-845", cblDate: "2026-03-16", totalInvoiceValue: "5345.33", grossProfit: "1018.56", itiniumInvoiceNo: "ITIN-845",
      batteries: [
        { assetNumber: "AST-2026-845", batterySerial: "BSN-EC-003", manufacture: "Exide", cellType: "PZB", voltage: "48V", notes: null, receiptConfirmed: true, pbContentKg: "820.000", valueGbp: "1450.00" },
        { assetNumber: "AST-2026-850", batterySerial: "BSN-EC-004", manufacture: "Exide", cellType: "PZB", voltage: "24V", notes: null, receiptConfirmed: true, pbContentKg: "410.000", valueGbp: "725.00" },
        { assetNumber: "AST-2026-851", batterySerial: "BSN-EC-005", manufacture: "Enersys", cellType: "PZS", voltage: "36V", notes: null, receiptConfirmed: true, pbContentKg: "615.000", valueGbp: "1087.50" },
        { assetNumber: null, batterySerial: null, manufacture: "Mixed", cellType: "Blocs", looseCellsQty: 24, notes: "Old blocs from various fleet vehicles", receiptConfirmed: true, pbContentKg: "1255.000", valueGbp: "2082.83" },
      ],
    },
    {
      reference: "JOB-2026-00844", clientName: "National Grid Services", depot: "London Depot", collectionPoint: "Barking Logistics Centre", collectionDate: "2026-03-13", submittedAt: new Date("2026-03-13"), tonnage: "0.900", status: "pending", invoiceStatus: "pending_invoice", lmeRateUsed: "1724.30", calculatedValue: "1551.87",
      batteries: [
        { assetNumber: "AST-2026-844", batterySerial: "BSN-NG-004", manufacture: "Hoppecke", cellType: "PZV", voltage: "48V", notes: null },
      ],
    },
    {
      reference: "JOB-2026-00843", clientName: "CleanPower UK", depot: "Bristol South", collectionPoint: "Avonmouth Dock Road", collectionDate: "2026-03-13", submittedAt: new Date("2026-03-13"), tonnage: "4.200", status: "approved", invoiceStatus: "invoiced", lmeRateUsed: "1724.30", calculatedValue: "7242.06", cblLmeValue: "1724.30", cblLmePercent: "72.50", cblLmePrice: "5253.10", transportCost: "480.00", customerInvoiceValue: "7242.06", customerInvoiceNo: "INV-2026-0843", cblWasteAdviceNoteNo: "WAN-843", cblDate: "2026-03-15", totalInvoiceValue: "7242.06", grossProfit: "1508.96",
      batteries: [
        { assetNumber: "AST-2026-843", batterySerial: "BSN-CP-005", manufacture: "Enersys", cellType: "PZB", voltage: "36V", notes: null },
        { assetNumber: "AST-2026-852", batterySerial: "BSN-CP-006", manufacture: "GNB", cellType: "PZS", voltage: "24V", notes: null },
        { assetNumber: null, batterySerial: null, manufacture: "Various", cellType: "Blocs", looseCellsQty: 36, notes: "Loose blocs recovered from warehouse clearance" },
      ],
    },
    {
      reference: "JOB-2026-00842", clientName: "Thames Batteries", depot: "Reading Central", collectionPoint: "Theale Business Park", collectionDate: "2026-03-12", submittedAt: new Date("2026-03-12"), tonnage: "1.500", status: "completed", invoiceStatus: "paid", lmeRateUsed: "1698.20", calculatedValue: "2547.30", cblLmeValue: "1698.20", cblLmePercent: "72.50", cblLmePrice: "1846.79", transportCost: "280.00", customerInvoiceValue: "2547.30", customerInvoiceNo: "INV-2026-0842", cblWasteAdviceNoteNo: "WAN-842", cblDate: "2026-03-14", totalInvoiceValue: "2547.30", grossProfit: "420.51", itiniumInvoiceNo: "ITIN-842",
      batteries: [
        { assetNumber: "AST-2026-842", batterySerial: "BSN-TB-006", manufacture: "Hawker", cellType: "PZB", voltage: "12V", notes: null },
        { assetNumber: "AST-2026-853", batterySerial: "BSN-TB-007", manufacture: "Hawker", cellType: "PZB", voltage: "24V", notes: null },
      ],
    },
    {
      reference: "JOB-2026-00841", clientName: "Northern Energy Co", depot: "Sheffield East", collectionPoint: "Tinsley Park Industrial", collectionDate: "2026-03-12", submittedAt: new Date("2026-03-12"), tonnage: "2.700", status: "pending", invoiceStatus: "pending_invoice", lmeRateUsed: "1698.20", calculatedValue: "4585.14",
      batteries: [
        { assetNumber: "AST-2026-841", batterySerial: "BSN-NE-007", manufacture: "Enersys", cellType: "PZB", voltage: "24V", notes: null },
        { assetNumber: "AST-2026-854", batterySerial: "BSN-NE-008", manufacture: "Exide", cellType: "PZV", voltage: "80V", notes: null },
        { assetNumber: null, batterySerial: null, manufacture: "GNB", cellType: "Blocs", looseCellsQty: 18, notes: null },
      ],
    },
    {
      reference: "JOB-2026-00840", clientName: "Severn Trent Recycling", depot: "Coventry West", collectionPoint: "Binley Industrial Estate", collectionDate: "2026-03-11", submittedAt: new Date("2026-03-11"), tonnage: "1.100", status: "flagged", notes: "Leaking observed on arrival", invoiceStatus: "pending_invoice", lmeRateUsed: "1698.20", calculatedValue: "1868.02",
      batteries: [
        { assetNumber: "AST-2026-840", batterySerial: "BSN-ST-008", manufacture: "Hoppecke", cellType: "PZB", voltage: "48V", notes: "Signs of leakage on casing" },
      ],
    },
    {
      reference: "JOB-2026-00839", clientName: "Midlands Power Corp", depot: "Birmingham Central", collectionPoint: "Erdington Depot", collectionDate: "2026-03-10", submittedAt: new Date("2026-03-10"), tonnage: "3.500", status: "approved", invoiceStatus: "invoiced", lmeRateUsed: "1698.20", calculatedValue: "5943.70", cblLmeValue: "1698.20", cblLmePercent: "72.50", cblLmePrice: "4309.43", transportCost: "410.00", customerInvoiceValue: "5943.70", customerInvoiceNo: "INV-2026-0839", cblWasteAdviceNoteNo: "WAN-839", cblDate: "2026-03-12", totalInvoiceValue: "5943.70", grossProfit: "1224.27",
      batteries: [
        { assetNumber: "AST-2026-839", batterySerial: "BSN-MP-009", manufacture: "Enersys", cellType: "PZB", voltage: "12V", notes: null },
        { assetNumber: "AST-2026-855", batterySerial: "BSN-MP-010", manufacture: "Hawker", cellType: "PZS", voltage: "24V", notes: null },
        { assetNumber: "AST-2026-856", batterySerial: "BSN-MP-011", manufacture: "Exide", cellType: "PZB", voltage: "48V", notes: null },
      ],
    },
    {
      reference: "JOB-2026-00838", clientName: "Yorkshire Metals Ltd", depot: "Leeds Hub", collectionPoint: "Hunslet Road Works", collectionDate: "2026-03-10", submittedAt: new Date("2026-03-10"), tonnage: "1.900", status: "completed", invoiceStatus: "paid", lmeRateUsed: "1698.20", calculatedValue: "3226.58", cblLmeValue: "1698.20", cblLmePercent: "72.50", cblLmePrice: "2339.95", transportCost: "310.00", customerInvoiceValue: "3226.58", customerInvoiceNo: "INV-2026-0838", cblWasteAdviceNoteNo: "WAN-838", cblDate: "2026-03-12", totalInvoiceValue: "3226.58", grossProfit: "576.63", itiniumInvoiceNo: "ITIN-838",
      batteries: [
        { assetNumber: "AST-2026-838", batterySerial: "BSN-YM-010", manufacture: "GNB", cellType: "PZV", voltage: "48V", notes: null },
        { assetNumber: null, batterySerial: null, manufacture: "Mixed", cellType: "Blocs", looseCellsQty: 8, notes: null },
      ],
    },
    {
      reference: "JOB-2026-00837", clientName: "Scottish Power Recycling", depot: "Manchester North", collectionPoint: "Salford Quays Unit 7", collectionDate: "2026-03-09", submittedAt: new Date("2026-03-09"), tonnage: "2.200", status: "pending", invoiceStatus: "pending_invoice", lmeRateUsed: "1698.20", calculatedValue: "3736.04",
      batteries: [
        { assetNumber: "AST-2026-837", batterySerial: "BSN-SP-011", manufacture: "Enersys", cellType: "PZB", voltage: "24V", notes: null },
        { assetNumber: "AST-2026-857", batterySerial: "BSN-SP-012", manufacture: "Enersys", cellType: "PZB", voltage: "36V", notes: null },
      ],
    },
    {
      reference: "JOB-2026-00836", clientName: "Cornwall Waste Services", depot: "Bristol South", collectionPoint: "Pool Industrial Estate", collectionDate: "2026-03-08", submittedAt: new Date("2026-03-08"), tonnage: "0.800", status: "completed", invoiceStatus: "paid", lmeRateUsed: "1698.20", calculatedValue: "1358.56", cblLmeValue: "1698.20", cblLmePercent: "72.50", cblLmePrice: "984.95", transportCost: "180.00", customerInvoiceValue: "1358.56", customerInvoiceNo: "INV-2026-0836", cblWasteAdviceNoteNo: "WAN-836", cblDate: "2026-03-10", totalInvoiceValue: "1358.56", grossProfit: "193.61", itiniumInvoiceNo: "ITIN-836",
      batteries: [
        { assetNumber: "AST-2026-836", batterySerial: "BSN-CW-012", manufacture: "Hawker", cellType: "PZS", voltage: "12V", notes: null },
      ],
    },
    {
      reference: "JOB-2026-00835", clientName: "East Anglian Batteries", depot: "London Depot", collectionPoint: "Chelmsford Business Park", collectionDate: "2026-03-07", submittedAt: new Date("2026-03-07"), tonnage: "5.100", status: "approved", invoiceStatus: "invoiced", lmeRateUsed: "1698.20", calculatedValue: "8660.82", cblLmeValue: "1698.20", cblLmePercent: "72.50", cblLmePrice: "6281.07", transportCost: "580.00", customerInvoiceValue: "8660.82", customerInvoiceNo: "INV-2026-0835", cblWasteAdviceNoteNo: "WAN-835", cblDate: "2026-03-09", totalInvoiceValue: "8660.82", grossProfit: "1799.75",
      batteries: [
        { assetNumber: "AST-2026-835", batterySerial: "BSN-EA-013", manufacture: "Exide", cellType: "PZB", voltage: "48V", notes: null },
        { assetNumber: "AST-2026-858", batterySerial: "BSN-EA-014", manufacture: "Exide", cellType: "PZB", voltage: "24V", notes: null },
        { assetNumber: "AST-2026-859", batterySerial: "BSN-EA-015", manufacture: "Enersys", cellType: "PZV", voltage: "80V", notes: null },
        { assetNumber: "AST-2026-860", batterySerial: "BSN-EA-016", manufacture: "GNB", cellType: "PZS", voltage: "36V", notes: null },
        { assetNumber: null, batterySerial: null, manufacture: "Various", cellType: "Blocs", looseCellsQty: 40, notes: "Large batch of decommissioned blocs" },
      ],
    },
    {
      reference: "JOB-2026-00834", clientName: "Welsh Green Energy", depot: "Birmingham Central", collectionPoint: "Swansea Enterprise Zone", collectionDate: "2026-03-06", submittedAt: new Date("2026-03-06"), tonnage: "1.300", status: "flagged", notes: "Hazardous material flag - requires specialist handling", invoiceStatus: "pending_invoice", lmeRateUsed: "1698.20", calculatedValue: "2207.66",
      batteries: [
        { assetNumber: "AST-2026-834", batterySerial: "BSN-WG-014", manufacture: "Hoppecke", cellType: "PZB", voltage: "36V", notes: "Possible lithium contamination - segregate" },
      ],
    },
    {
      reference: "JOB-2026-00833", clientName: "Aberdeen Recycling Group", depot: "Sheffield East", collectionPoint: "Altens Industrial Estate", collectionDate: "2026-03-05", submittedAt: new Date("2026-03-05"), tonnage: "2.000", status: "pending", invoiceStatus: "pending_invoice", lmeRateUsed: "1698.20", calculatedValue: "3396.40",
      batteries: [
        { assetNumber: "AST-2026-833", batterySerial: "BSN-AR-015", manufacture: "Enersys", cellType: "PZB", voltage: "12V", notes: null },
        { assetNumber: "AST-2026-861", batterySerial: "BSN-AR-016", manufacture: "Exide", cellType: "PZB", voltage: "24V", notes: null },
      ],
    },
    {
      reference: "JOB-2026-00832", clientName: "South Coast Metals", depot: "Reading Central", collectionPoint: "Poole Trading Estate", collectionDate: "2026-03-04", submittedAt: new Date("2026-03-04"), tonnage: "3.800", status: "completed", invoiceStatus: "paid", lmeRateUsed: "1698.20", calculatedValue: "6453.16", cblLmeValue: "1698.20", cblLmePercent: "72.50", cblLmePrice: "4685.00", transportCost: "520.00", customerInvoiceValue: "6453.16", customerInvoiceNo: "INV-2026-0832", cblWasteAdviceNoteNo: "WAN-832", cblDate: "2026-03-06", totalInvoiceValue: "6453.16", grossProfit: "1248.16", itiniumInvoiceNo: "ITIN-832",
      batteries: [
        { assetNumber: "AST-2026-832", batterySerial: "BSN-SC-016", manufacture: "Hawker", cellType: "PZB", voltage: "24V", notes: null },
        { assetNumber: "AST-2026-862", batterySerial: "BSN-SC-017", manufacture: "GNB", cellType: "PZS", voltage: "48V", notes: null },
        { assetNumber: null, batterySerial: null, manufacture: "Mixed", cellType: "Blocs", looseCellsQty: 20, notes: "Standard loose cell collection" },
      ],
    },
    {
      reference: "JOB-2026-00831", clientName: "Peak District Energy", depot: "Manchester North", collectionPoint: "Buxton Quarry Road", collectionDate: "2026-03-03", submittedAt: new Date("2026-03-03"), tonnage: "1.600", status: "approved", invoiceStatus: "invoiced", lmeRateUsed: "1698.20", calculatedValue: "2717.12",
      batteries: [
        { assetNumber: "AST-2026-831", batterySerial: "BSN-PD-017", manufacture: "Enersys", cellType: "PZV", voltage: "80V", notes: null },
      ],
    },
    {
      reference: "JOB-2026-00830", clientName: "Highland Batteries Co", depot: "Leeds Hub", collectionPoint: "Inverness Retail Park", collectionDate: "2026-03-02", submittedAt: new Date("2026-03-02"), tonnage: "2.900", status: "pending", invoiceStatus: "pending_invoice", lmeRateUsed: "1698.20", calculatedValue: "4924.78",
      batteries: [
        { assetNumber: "AST-2026-830", batterySerial: "BSN-HB-018", manufacture: "Exide", cellType: "PZB", voltage: "48V", notes: null },
        { assetNumber: "AST-2026-863", batterySerial: "BSN-HB-019", manufacture: "Hawker", cellType: "PZB", voltage: "24V", notes: null },
        { assetNumber: null, batterySerial: null, manufacture: "GNB", cellType: "Blocs", looseCellsQty: 15, notes: null },
      ],
    },
  ];

  await db.delete(jobBatteriesTable);
  await db.delete(jobsTable);
  await db.execute(sql`CREATE SEQUENCE IF NOT EXISTS pallet_number_seq START WITH 1 INCREMENT BY 1`);
  await db.execute(sql`ALTER SEQUENCE pallet_number_seq RESTART WITH 1`);

  for (let i = 0; i < jobsData.length; i++) {
    const { batteries, ...jobValues } = jobsData[i];
    const [insertedJob] = await db
      .insert(jobsTable)
      .values({ ...jobValues, submittedById: pickSubmitter(i) })
      .onConflictDoNothing()
      .returning();

    if (insertedJob && batteries) {
      const seqResult = await db.execute(
        sql`SELECT nextval('pallet_number_seq') AS seq FROM generate_series(1, ${batteries.length})`
      );
      const palletNumbers = (seqResult.rows as { seq: string }[]).map(
        (r) => `PLT-${String(r.seq).padStart(5, "0")}`
      );
      for (let j = 0; j < batteries.length; j++) {
        await db
          .insert(jobBatteriesTable)
          .values({ jobId: insertedJob.id, palletNumber: palletNumbers[j], ...batteries[j] })
          .onConflictDoNothing();
      }
    }
  }

  console.log(`Seeded ${jobsData.length} demo jobs with battery line items`);

  const lmePrices = [
    { priceDate: "2026-03-15", usdPrice: "2185.50", exchangeRate: "0.789200", gbpPrice: "1724.30", source: "manual" },
    { priceDate: "2026-03-01", usdPrice: "2152.00", exchangeRate: "0.789200", gbpPrice: "1698.20", source: "manual" },
    { priceDate: "2026-02-15", usdPrice: "2120.75", exchangeRate: "0.791000", gbpPrice: "1677.51", source: "manual" },
    { priceDate: "2026-02-01", usdPrice: "2098.30", exchangeRate: "0.785000", gbpPrice: "1647.17", source: "manual" },
    { priceDate: "2026-01-15", usdPrice: "2065.00", exchangeRate: "0.788500", gbpPrice: "1628.24", source: "manual" },
  ];

  for (const p of lmePrices) {
    await db.insert(lmePricesTable).values(p).onConflictDoNothing();
  }

  console.log(`Seeded ${lmePrices.length} LME price entries`);

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

  await db.delete(batteryWeightReferenceTable);
  const weightRefs = [
    { cellType: "PZB", voltage: "12V", weightKg: "180.000" },
    { cellType: "PZB", voltage: "24V", weightKg: "360.000" },
    { cellType: "PZB", voltage: "36V", weightKg: "540.000" },
    { cellType: "PZB", voltage: "48V", weightKg: "720.000" },
    { cellType: "PZB", voltage: "80V", weightKg: "1200.000" },
    { cellType: "PZS", voltage: "12V", weightKg: "200.000" },
    { cellType: "PZS", voltage: "24V", weightKg: "400.000" },
    { cellType: "PZS", voltage: "36V", weightKg: "600.000" },
    { cellType: "PZS", voltage: "48V", weightKg: "800.000" },
    { cellType: "PZS", voltage: "80V", weightKg: "1330.000" },
    { cellType: "PZV", voltage: "12V", weightKg: "170.000" },
    { cellType: "PZV", voltage: "24V", weightKg: "340.000" },
    { cellType: "PZV", voltage: "36V", weightKg: "510.000" },
    { cellType: "PZV", voltage: "48V", weightKg: "680.000" },
    { cellType: "PZV", voltage: "80V", weightKg: "1130.000" },
    { cellType: "Blocs", voltage: null, weightKg: "25.000" },
    { cellType: "Other", voltage: null, weightKg: "0.000" },
  ];
  for (const wr of weightRefs) {
    await db.insert(batteryWeightReferenceTable).values(wr).onConflictDoNothing();
  }
  console.log(`Seeded ${weightRefs.length} battery weight references`);

  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
