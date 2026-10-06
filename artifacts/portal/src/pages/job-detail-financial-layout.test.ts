import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourcePath = join(process.cwd(), "src/pages/job-detail.tsx");
const source = readFileSync(sourcePath, "utf8");
const depotFormSource = readFileSync(join(process.cwd(), "src/pages/depot-form.tsx"), "utf8");

function sectionBetween(startHeading: string, endHeading: string): string {
  const start = source.indexOf(`>${startHeading}</h5>`);
  const end = source.indexOf(`>${endHeading}</h5>`, start + 1);
  if (start < 0 || end < 0) throw new Error(`Could not find ${startHeading} → ${endHeading}`);
  return source.slice(start, end);
}

describe("financial master-log field grouping", () => {
  it("removes Spot Blocs from the Waste Collector calculation", () => {
    const wasteCollector = sectionBetween("Waste Collector", "Customer");
    expect(wasteCollector).toContain('label="% Spot Traction"');
    expect(wasteCollector).not.toContain('label="% Spot Blocs"');
    expect(wasteCollector).toContain('label="Invoice Value"');
    expect(wasteCollector).toContain('label="Invoice No."');
    expect(wasteCollector).not.toContain('label="Customer Invoice Value £"');
    expect(wasteCollector).not.toContain('label="Customer Invoice No."');
    expect(source).toContain('const wasteBlocsRate = "0.00"');
    expect(source).toContain('const { wasteBlocsPercent: _unusedWasteBlocsPercent, ...financialsWithoutWasteBlocsPercent }');
    expect(wasteCollector).toContain('<div className="col-span-2 grid grid-cols-2 gap-3">');
    expect(wasteCollector.indexOf('label="Pb tonnage Traction"')).toBeLessThan(
      wasteCollector.indexOf('label="Pb tonnage Blocs"')
    );
  });

  it("keeps the customer invoice pair under Customer", () => {
    const customerStart = source.indexOf(">Customer</h5>");
    const customerEnd = source.indexOf("</section>", customerStart);
    const customer = source.slice(customerStart, customerEnd);
    expect(customer).toContain('label="% LME Traction"');
    expect(customer).toContain('label="% LME Blocs"');
    expect(customer).toContain('label="Customer Invoice Value £"');
    expect(customer).toContain('label="Customer Invoice No."');
    expect(customer.indexOf('label="% LME Traction"')).toBeLessThan(
      customer.indexOf('label="Customer Invoice Value £"')
    );
    expect(customer).not.toContain('label="% Spot Traction"');
  });
});

describe("job-detail save controls", () => {
  it("incorporates collection sheet fields and internal notes into the first line-items table", () => {
    const collectionTableStart = source.indexOf('<table className="w-full text-sm">');
    const collectionTableEnd = source.indexOf("</table>", collectionTableStart);
    const collectionTable = source.slice(collectionTableStart, collectionTableEnd);
    expect(collectionTable).toContain("Collection Sheet Details");
    expect(collectionTable).toContain("Driver Name");
    expect(collectionTable).toContain("Vehicle Registration");
    expect(collectionTable).toContain("Collection Date");
    expect(collectionTable).toContain("Site Contacts");
    expect(collectionTable).toContain("Site Hours");
    expect(collectionTable).toContain("Special / Loading Instructions");
    expect(collectionTable).toContain("Internal Notes");
    expect(collectionTable).toContain("siteDetails.notes");
    expect(source.match(/>Collection Sheet Details</g)).toHaveLength(1);
  });

  it("shows the proposed collection date until Itinium saves a confirmed date", () => {
    expect(source).toContain(
      'return job?.collectionDate || job?.proposedCollectionDate || "";'
    );
    expect(source).toContain("collectionDate: collectionDetailsDate(data.job)");
    expect(source).toContain(
      "siteDetails.collectionDate === collectionDetailsDate(job)"
    );
  });

  it("keeps the battery admin update handler used by collection rows", () => {
    expect(source).toContain("async function updateBatteryAdmin");
    expect(source).toContain("onSaveField={updateBatteryAdmin}");
  });

  it("requires explicit edit mode before saving Financial Master", () => {
    expect(source).toContain("Edit Financial Master");
    expect(source).toContain("Save Financial Master");
    expect(source).toContain("cancelEditingFinancials");
    expect(source).toContain("<fieldset disabled={!financialEditing}>");
  });

  it("allows manual invoice and payment tracking without requiring an LME price", () => {
    expect(source).toContain('"wasteInvoiceNo"');
    expect(source).toContain('"customerInvoiceNo"');
    expect(source).toContain('"invoiceReceivedDate"');
    expect(source).toContain('"dueDate"');
    expect(source).toContain('"datePaid"');
    expect(source).toContain("Object.fromEntries(changedEntries)");
    expect(source).toContain("requiresCollectionLme && !collectionLmeUsable");
    expect(source).toContain("disabled={saving}");
    expect(source).not.toContain("disabled={saving || !collectionLmeUsable}");
  });

  it("calculates the days left to pay from the manually entered due date", () => {
    expect(source).toContain("function getInvoiceDueStatus");
    expect(source).toContain("Days left to pay");
    expect(source).toContain("financials.dueDate, financials.datePaid");
    expect(source).toContain("Due today");
    expect(source).toContain("overdue");
  });

  it("has receipt-table save controls above and below without per-row saves", () => {
    expect(source.match(/onClick=\{saveReceiptRows\}/g)).toHaveLength(2);
    const rowStart = source.indexOf("function BatteryAdminRow");
    const rowEnd = source.indexOf("function FinancialField", rowStart);
    const rowSource = source.slice(rowStart, rowEnd);
    expect(rowSource).not.toContain(">Save</Button>");
    const receiptSectionStart = source.indexOf("Battery Receipt Confirmation & Pb Content");
    const receiptSectionEnd = source.indexOf("Financial Master", receiptSectionStart);
    const receiptSection = source.slice(receiptSectionStart, receiptSectionEnd);
    expect(receiptSection).not.toContain("LME GBP:");
  });

  it("edits every displayed receipt-table data field through the shared draft", () => {
    const receiptSectionStart = source.indexOf("Battery Receipt Confirmation & Pb Content");
    const receiptSectionEnd = source.indexOf("Financial Master", receiptSectionStart);
    const receiptSection = source.slice(receiptSectionStart, receiptSectionEnd);
    const rowStart = source.indexOf("function BatteryAdminRow");
    const rowEnd = source.indexOf("function FinancialField", rowStart);
    const rowSource = source.slice(rowStart, rowEnd);
    expect(receiptSection).toContain(">Serial</th>");
    expect(receiptSection).toContain(">Pallet</th>");
    expect(receiptSection.indexOf(">Pallet</th>")).toBeLessThan(receiptSection.indexOf(">Serial</th>"));
    expect(receiptSection).not.toContain("Serial / Pallet");
    expect(source).toContain('batterySerial: battery.batterySerial || ""');
    expect(source).toContain('palletNumber: battery.palletNumber || ""');
    expect(source).toContain('cellType: battery.cellType || ""');
    expect(rowSource).toContain("value={draft.batterySerial}");
    expect(rowSource).toContain("batterySerial: e.target.value");
    expect(rowSource).toContain("value={draft.palletNumber}");
    expect(rowSource.indexOf("value={draft.palletNumber}")).toBeLessThan(rowSource.indexOf("value={draft.batterySerial}"));
    expect(rowSource).toContain("palletNumber: e.target.value");
    expect(rowSource).toContain("value={draft.cellType}");
    expect(rowSource).toContain("cellType: e.target.value");
    expect(rowSource).toContain("value={draft.voltage}");
    expect(rowSource).toContain("voltage: e.target.value");
    expect(rowSource).toContain("value={draft.pbContentKg}");
    expect(rowSource).toContain("pbContentKg: e.target.value");
    expect(rowSource).toContain("value={draft.valueGbp}");
    expect(rowSource).toContain("valueGbp: e.target.value");
    expect(rowSource).toContain("value={draft.notes}");
    expect(rowSource).toContain("notes: e.target.value");
  });

  it("pulls collection notes into an editable shared receipt draft", () => {
    const rowStart = source.indexOf("function BatteryAdminRow");
    const rowEnd = source.indexOf("function FinancialField", rowStart);
    const rowSource = source.slice(rowStart, rowEnd);
    expect(source).toContain('notes: battery.notes || ""');
    expect(rowSource).toContain("value={draft.notes}");
    expect(rowSource).toContain("notes: e.target.value");
    expect(rowSource).toContain('placeholder="Add notes…"');
  });

  it("pulls voltage into an editable receipt draft for every row", () => {
    const rowStart = source.indexOf("function BatteryAdminRow");
    const rowEnd = source.indexOf("function FinancialField", rowStart);
    const rowSource = source.slice(rowStart, rowEnd);
    expect(source).toContain('voltage: battery.voltage || ""');
    expect(rowSource).toContain("value={draft.voltage}");
    expect(rowSource).toContain("voltage: e.target.value");
    expect(rowSource).toContain('placeholder="Voltage"');
  });

  it("only sends receipt fields the user actually changed", () => {
    expect(source).toContain("function receiptPatchFromDraft");
    expect(source).toContain("for (const field of dirtyFields)");
    expect(source).toContain("JSON.stringify(receiptPatchFromDraft(draft, fields))");
    expect(source).not.toContain("notes: draft.notes || null");
    expect(source).toContain("This battery has unsaved receipt-table changes");
  });

  it("warns before leaving with unsaved site, receipt, or financial changes", () => {
    expect(source).toContain("siteDetailsDirty || financialsDirty || dirtyReceiptIds.size > 0");
    expect(source).toContain('window.addEventListener("beforeunload"');
    expect(source).toContain('window.addEventListener("popstate"');
    expect(source).toContain('target.closest<HTMLAnchorElement>("a[href]")');
    expect(source).toContain("You have unsaved changes on this job");
  });

  it("keeps optional loose-cell voltage from depot entry through submission", () => {
    expect(depotFormSource).toContain('"Loose Cell Voltage (optional)"');
    expect(depotFormSource).toContain(
      "voltage: (b.voltage === \"Other\" ? b.customVoltage : b.voltage) || null"
    );
    expect(depotFormSource).not.toContain("voltage: b.isLooseCells ? null");
  });

  it("distinguishes unconfirmed manufacturers in the TAB-weight message", () => {
    expect(source).toContain("unconfirmed manufacturers will be confirmed with TAB weights");
    expect(source).not.toContain("items with TAB weights");
  });
});