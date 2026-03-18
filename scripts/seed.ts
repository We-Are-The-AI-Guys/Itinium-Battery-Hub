import { db } from "@workspace/db";
import { usersTable, jobsTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcrypt";

async function seed() {
  const password = await bcrypt.hash("password123", 10);

  const users = [
    { email: "depot@itinium.co.uk", fullName: "Dave Mitchell", role: "depot_user", depot: "Birmingham Central" },
    { email: "team@itinium.co.uk", fullName: "Sarah Cooper", role: "team_leader", depot: "Birmingham Central" },
    { email: "accounts@itinium.co.uk", fullName: "Rachel Adams", role: "accounts", depot: null },
    { email: "admin@itinium.co.uk", fullName: "Sarah Mitchell", role: "head_office_admin", depot: null },
  ];

  for (const u of users) {
    await db
      .insert(usersTable)
      .values({ ...u, passwordHash: password })
      .onConflictDoNothing();
  }

  console.log("Seeded 4 demo users (password: password123)");

  const [depotUser] = await db.select().from(usersTable).where(eq(usersTable.email, "depot@itinium.co.uk"));
  const [teamUser] = await db.select().from(usersTable).where(eq(usersTable.email, "team@itinium.co.uk"));
  const submitterIds = [depotUser?.id, teamUser?.id].filter(Boolean);
  function pickSubmitter(index: number) {
    return submitterIds.length > 0 ? submitterIds[index % submitterIds.length] : undefined;
  }

  const jobs = [
    { reference: "JOB-2026-00847", clientName: "Greenfield Recycling", depot: "Birmingham Central", submittedAt: new Date("2026-03-15"), tonnage: "2.400", status: "pending", palletNumber: "PLT-847", assetNumber: "AST-2026-847", batterySerial: "BSN-GR-001", cellType: "lead_acid", voltage: "12v", weight: "2400.00", condition: "good", invoiceStatus: "pending_invoice", lmeRateUsed: "1724.30", calculatedValue: "4138.32" },
    { reference: "JOB-2026-00846", clientName: "Metro Waste Solutions", depot: "Manchester North", submittedAt: new Date("2026-03-14"), tonnage: "1.800", status: "approved", palletNumber: "PLT-846", assetNumber: "AST-2026-846", batterySerial: "BSN-MW-002", cellType: "lead_acid", voltage: "24v", weight: "1800.00", condition: "fair", invoiceStatus: "invoiced", lmeRateUsed: "1724.30", calculatedValue: "3103.74" },
    { reference: "JOB-2026-00845", clientName: "EcoCollect Ltd", depot: "Leeds Hub", submittedAt: new Date("2026-03-14"), tonnage: "3.100", status: "completed", palletNumber: "PLT-845", assetNumber: "AST-2026-845", batterySerial: "BSN-EC-003", cellType: "lithium_ion", voltage: "48v", weight: "3100.00", condition: "good", invoiceStatus: "paid", lmeRateUsed: "1724.30", calculatedValue: "5345.33" },
    { reference: "JOB-2026-00844", clientName: "National Grid Services", depot: "London Depot", submittedAt: new Date("2026-03-13"), tonnage: "0.900", status: "pending", palletNumber: "PLT-844", assetNumber: "AST-2026-844", batterySerial: "BSN-NG-004", cellType: "lead_acid", voltage: "12v", weight: "900.00", condition: "good", invoiceStatus: "pending_invoice", lmeRateUsed: "1724.30", calculatedValue: "1551.87" },
    { reference: "JOB-2026-00843", clientName: "CleanPower UK", depot: "Bristol South", submittedAt: new Date("2026-03-13"), tonnage: "4.200", status: "approved", palletNumber: "PLT-843", assetNumber: "AST-2026-843", batterySerial: "BSN-CP-005", cellType: "nickel_cadmium", voltage: "36v", weight: "4200.00", condition: "fair", invoiceStatus: "invoiced", lmeRateUsed: "1724.30", calculatedValue: "7242.06" },
    { reference: "JOB-2026-00842", clientName: "Thames Batteries", depot: "Reading Central", submittedAt: new Date("2026-03-12"), tonnage: "1.500", status: "completed", palletNumber: "PLT-842", assetNumber: "AST-2026-842", batterySerial: "BSN-TB-006", cellType: "lead_acid", voltage: "12v", weight: "1500.00", condition: "good", invoiceStatus: "paid", lmeRateUsed: "1698.20", calculatedValue: "2547.30" },
    { reference: "JOB-2026-00841", clientName: "Northern Energy Co", depot: "Sheffield East", submittedAt: new Date("2026-03-12"), tonnage: "2.700", status: "pending", palletNumber: "PLT-841", assetNumber: "AST-2026-841", batterySerial: "BSN-NE-007", cellType: "lead_acid", voltage: "24v", weight: "2700.00", condition: "poor", invoiceStatus: "pending_invoice", lmeRateUsed: "1698.20", calculatedValue: "4585.14" },
    { reference: "JOB-2026-00840", clientName: "Severn Trent Recycling", depot: "Coventry West", submittedAt: new Date("2026-03-11"), tonnage: "1.100", status: "flagged", palletNumber: "PLT-840", assetNumber: "AST-2026-840", batterySerial: "BSN-ST-008", cellType: "lithium_ion", voltage: "48v", weight: "1100.00", condition: "damaged", notes: "Leaking observed on arrival", invoiceStatus: "pending_invoice", lmeRateUsed: "1698.20", calculatedValue: "1868.02" },
    { reference: "JOB-2026-00839", clientName: "Midlands Power Corp", depot: "Birmingham Central", submittedAt: new Date("2026-03-10"), tonnage: "3.500", status: "approved", palletNumber: "PLT-839", assetNumber: "AST-2026-839", batterySerial: "BSN-MP-009", cellType: "lead_acid", voltage: "12v", weight: "3500.00", condition: "good", invoiceStatus: "invoiced", lmeRateUsed: "1698.20", calculatedValue: "5943.70" },
    { reference: "JOB-2026-00838", clientName: "Yorkshire Metals Ltd", depot: "Leeds Hub", submittedAt: new Date("2026-03-10"), tonnage: "1.900", status: "completed", palletNumber: "PLT-838", assetNumber: "AST-2026-838", batterySerial: "BSN-YM-010", cellType: "nickel_metal_hydride", voltage: "12v", weight: "1900.00", condition: "fair", invoiceStatus: "paid", lmeRateUsed: "1698.20", calculatedValue: "3226.58" },
    { reference: "JOB-2026-00837", clientName: "Scottish Power Recycling", depot: "Manchester North", submittedAt: new Date("2026-03-09"), tonnage: "2.200", status: "pending", palletNumber: "PLT-837", assetNumber: "AST-2026-837", batterySerial: "BSN-SP-011", cellType: "lead_acid", voltage: "24v", weight: "2200.00", condition: "good", invoiceStatus: "pending_invoice", lmeRateUsed: "1698.20", calculatedValue: "3736.04" },
    { reference: "JOB-2026-00836", clientName: "Cornwall Waste Services", depot: "Bristol South", submittedAt: new Date("2026-03-08"), tonnage: "0.800", status: "completed", palletNumber: "PLT-836", assetNumber: "AST-2026-836", batterySerial: "BSN-CW-012", cellType: "alkaline", voltage: "6v", weight: "800.00", condition: "good", invoiceStatus: "paid", lmeRateUsed: "1698.20", calculatedValue: "1358.56" },
    { reference: "JOB-2026-00835", clientName: "East Anglian Batteries", depot: "London Depot", submittedAt: new Date("2026-03-07"), tonnage: "5.100", status: "approved", palletNumber: "PLT-835", assetNumber: "AST-2026-835", batterySerial: "BSN-EA-013", cellType: "lead_acid", voltage: "48v", weight: "5100.00", condition: "good", invoiceStatus: "invoiced", lmeRateUsed: "1698.20", calculatedValue: "8660.82" },
    { reference: "JOB-2026-00834", clientName: "Welsh Green Energy", depot: "Birmingham Central", submittedAt: new Date("2026-03-06"), tonnage: "1.300", status: "flagged", palletNumber: "PLT-834", assetNumber: "AST-2026-834", batterySerial: "BSN-WG-014", cellType: "lithium_ion", voltage: "36v", weight: "1300.00", condition: "leaking", notes: "Hazardous material flag - requires specialist handling", invoiceStatus: "pending_invoice", lmeRateUsed: "1698.20", calculatedValue: "2207.66" },
    { reference: "JOB-2026-00833", clientName: "Aberdeen Recycling Group", depot: "Sheffield East", submittedAt: new Date("2026-03-05"), tonnage: "2.000", status: "pending", palletNumber: "PLT-833", assetNumber: "AST-2026-833", batterySerial: "BSN-AR-015", cellType: "lead_acid", voltage: "12v", weight: "2000.00", condition: "fair", invoiceStatus: "pending_invoice", lmeRateUsed: "1698.20", calculatedValue: "3396.40" },
    { reference: "JOB-2026-00832", clientName: "South Coast Metals", depot: "Reading Central", submittedAt: new Date("2026-03-04"), tonnage: "3.800", status: "completed", palletNumber: "PLT-832", assetNumber: "AST-2026-832", batterySerial: "BSN-SC-016", cellType: "lead_acid", voltage: "24v", weight: "3800.00", condition: "good", invoiceStatus: "paid", lmeRateUsed: "1698.20", calculatedValue: "6453.16" },
    { reference: "JOB-2026-00831", clientName: "Peak District Energy", depot: "Manchester North", submittedAt: new Date("2026-03-03"), tonnage: "1.600", status: "approved", palletNumber: "PLT-831", assetNumber: "AST-2026-831", batterySerial: "BSN-PD-017", cellType: "nickel_cadmium", voltage: "12v", weight: "1600.00", condition: "good", invoiceStatus: "invoiced", lmeRateUsed: "1698.20", calculatedValue: "2717.12" },
    { reference: "JOB-2026-00830", clientName: "Highland Batteries Co", depot: "Leeds Hub", submittedAt: new Date("2026-03-02"), tonnage: "2.900", status: "pending", palletNumber: "PLT-830", assetNumber: "AST-2026-830", batterySerial: "BSN-HB-018", cellType: "lead_acid", voltage: "48v", weight: "2900.00", condition: "fair", invoiceStatus: "pending_invoice", lmeRateUsed: "1698.20", calculatedValue: "4924.78" },
  ];

  for (let i = 0; i < jobs.length; i++) {
    await db
      .insert(jobsTable)
      .values({ ...jobs[i], submittedById: pickSubmitter(i) })
      .onConflictDoNothing();
  }

  console.log(`Seeded ${jobs.length} demo jobs`);
  process.exit(0);
}

seed().catch((e) => { console.error(e); process.exit(1); });
