import { describe, it, expect } from "vitest";
import {
  escapeHtml,
  buildScheduleProposedEmailHtml,
  buildScheduleConfirmedEmailHtml,
} from "../notifications";

const XSS_DRIVER = `<img src=x onerror=alert(1)>Driver`;
const XSS_VEHICLE = `<a href="https://evil.example">K40 CBL</a>`;

describe("escapeHtml", () => {
  it("escapes all HTML-significant characters", () => {
    expect(escapeHtml(`<b>&"'</b>`)).toBe("&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;");
  });
});

describe("schedule proposed email", () => {
  it("encodes HTML in collection-company-controlled driver/vehicle/company values", () => {
    const html = buildScheduleProposedEmailHtml(
      { id: 1, reference: "JOB-<script>1" },
      {
        companyName: `<script>alert(1)</script>CBL`,
        driverName: XSS_DRIVER,
        vehicleReg: XSS_VEHICLE,
        proposedDate: "2026-08-20",
      }
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain(`<a href="https://evil.example">`);
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;Driver");
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;K40 CBL&lt;/a&gt;");
  });
});

describe("schedule confirmed email", () => {
  it("encodes HTML in driver, vehicle, and site free-text values", () => {
    const html = buildScheduleConfirmedEmailHtml(
      { reference: "JOB-0001" },
      `<b>Kenny</b>`,
      {
        collectionDate: "2026-08-21",
        driverName: XSS_DRIVER,
        vehicleReg: XSS_VEHICLE,
        siteAddress: "Unit 1 <script>x</script> — Leeds",
        siteHours: `<iframe src="x"></iframe>8-4`,
        siteContacts: `Kenny <script>steal()</script>`,
        specialInstructions: `<img src=x>Use rear gate`,
      }
    );
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("<b>Kenny</b>");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;Driver");
    // Address keeps intentional <br/> line breaks but escapes the content.
    expect(html).toContain("Unit 1 &lt;script&gt;x&lt;/script&gt;<br/>Leeds");
  });
});
