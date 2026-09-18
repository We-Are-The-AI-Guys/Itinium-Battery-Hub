import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sourcePath = join(process.cwd(), "src/pages/job-detail.tsx");
const source = readFileSync(sourcePath, "utf8");

function sectionBetween(startHeading: string, endHeading: string): string {
  const start = source.indexOf(`>${startHeading}</h5>`);
  const end = source.indexOf(`>${endHeading}</h5>`, start + 1);
  if (start < 0 || end < 0) throw new Error(`Could not find ${startHeading} → ${endHeading}`);
  return source.slice(start, end);
}

describe("financial master-log field grouping", () => {
  it("keeps the separate Spot traction and blocs calculation under Waste Collector", () => {
    const wasteCollector = sectionBetween("Waste Collector", "Customer");
    expect(wasteCollector).toContain('label="% Spot Traction"');
    expect(wasteCollector).toContain('label="% Spot Blocs"');
    expect(wasteCollector).toContain('label="Invoice Value"');
    expect(wasteCollector).toContain('label="Invoice No."');
    expect(wasteCollector).not.toContain('label="Customer Invoice Value £"');
    expect(wasteCollector).not.toContain('label="Customer Invoice No."');
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
  it("incorporates collection sheet fields and notes into the first line-items table", () => {
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
    expect(collectionTable).toContain("Collection Notes");
    expect(collectionTable).toContain("siteDetails.notes");
    expect(source.match(/>Collection Sheet Details</g)).toHaveLength(1);
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

  it("has receipt-table save controls above and below without per-row saves", () => {
    expect(source.match(/onClick=\{saveReceiptRows\}/g)).toHaveLength(2);
    const rowStart = source.indexOf("function BatteryAdminRow");
    const rowEnd = source.indexOf("function FinancialField", rowStart);
    const rowSource = source.slice(rowStart, rowEnd);
    expect(rowSource).not.toContain(">Save</Button>");
  });
});