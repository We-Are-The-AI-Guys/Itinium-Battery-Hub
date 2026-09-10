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
  it("keeps the Itinium invoice pair under Waste Collector", () => {
    const wasteCollector = sectionBetween("Waste Collector", "Customer");
    expect(wasteCollector).toContain('label="Total Invoice Value £"');
    expect(wasteCollector).toContain('label="Itinium Invoice No."');
    expect(wasteCollector).not.toContain('label="Customer Invoice Value £"');
    expect(wasteCollector).not.toContain('label="Customer Invoice No."');
  });

  it("keeps the customer invoice pair under Customer", () => {
    const customerStart = source.indexOf(">Customer</h5>");
    const customerEnd = source.indexOf("</section>", customerStart);
    const customer = source.slice(customerStart, customerEnd);
    expect(customer).toContain('label="% LME"');
    expect(customer).toContain('label="Customer Invoice Value £"');
    expect(customer).toContain('label="Customer Invoice No."');
    expect(customer.indexOf('label="% LME"')).toBeLessThan(
      customer.indexOf('label="Customer Invoice Value £"')
    );
    expect(customer).not.toContain('label="Total Invoice Value £"');
    expect(customer).not.toContain('label="Itinium Invoice No."');
  });
});