import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminDashboardPage from "../admin-dashboard";
import { formatCustomerPbWeight } from "@/lib/customer-pb-weight";

vi.mock("@/components/sidebar-layout", () => ({
  SidebarLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()] }));
vi.mock("@/components/customer-documents", () => ({ CustomerDocuments: () => null }));

let traction = "1.234";
let blocs = "0.006";
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = String(input);
  const data = url.startsWith("/api/jobs?")
    ? { jobs: [{
      id: 1, reference: "WEIGHT-TEST", clientName: "Test", depot: "Depot",
      submittedAt: "2026-10-08", tonnage: "9.876", status: "request",
      customerTractionTonnage: traction, customerBlocsTonnage: blocs,
      wasteTractionTonnage: "7.000", wasteBlocsTonnage: "2.000", pbContentKgSum: "8000",
      palletCount: 4, calculatedValue: "1250", grossProfit: "250",
    }], pagination: { limit: 8, offset: Number(new URL(url, "http://test").searchParams.get("offset")), total: 16, totalPages: 2 } }
    : url === "/api/job-drafts" ? { drafts: [] }
    : url === "/api/stillages/summary" ? { totalInCirculation: 0 } : null;
  return { ok: true, json: async () => data } as Response;
});

beforeEach(() => { traction = "1.234"; blocs = "0.006"; vi.stubGlobal("fetch", fetchMock); fetchMock.mockClear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("Customer Pb dashboard weight", () => {
  it.each([
    [null, null, "—"], ["", " ", "—"], ["0", null, "0.000t"],
    ["0", "0", "0.000t"], ["0.001", null, "0.001t"],
    [null, "0.002", "0.002t"], ["1.234", "0.006", "1.240t"],
    ["invalid", "1", "—"],
  ])("formats %s and %s without falling back to CBL", (a, b, expected) => {
    expect(formatCustomerPbWeight(a, b)).toBe(expected);
  });

  it("keeps weight sources separate through tabs, filtering, pagination and reloads", async () => {
    const view = render(<AdminDashboardPage />);
    await screen.findByText("9.9t");
    const table = within(screen.getByRole("table"));
    expect(table.getByRole("columnheader", { name: "Tonnage" })).toBeTruthy();
    expect(table.getByRole("columnheader", { name: "Pallets" })).toBeTruthy();
    expect(table.getByRole("cell", { name: "4", exact: true })).toBeTruthy();
    expect(table.queryByRole("columnheader", { name: "Value", exact: true })).toBeNull();
    expect(table.queryByRole("columnheader", { name: "Gross Profit" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Financial", exact: true }));
    expect(table.getByRole("columnheader", { name: "Customer Pb weight (t)" })).toBeTruthy();
    expect(table.getByText("1.240t")).toBeTruthy();
    expect(table.getByRole("columnheader", { name: "Value", exact: true })).toBeTruthy();
    expect(table.getByRole("columnheader", { name: "Gross Profit" })).toBeTruthy();
    expect(table.getByText("£1,250")).toBeTruthy();
    expect(table.getByText("£250")).toBeTruthy();
    expect(table.queryByText("9.9t")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Requested", exact: true }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/jobs?status=request&limit=8&offset=0", expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "2", exact: true }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/jobs?status=request&limit=8&offset=8", expect.anything()));
    expect(table.getByText("1.240t")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Operational", exact: true }));
    expect(table.getByText("9.9t")).toBeTruthy();
    expect(table.queryByRole("columnheader", { name: "Value", exact: true })).toBeNull();
    expect(table.queryByRole("columnheader", { name: "Gross Profit" })).toBeNull();
    view.unmount();
    traction = "2.000"; blocs = "0.005";
    render(<AdminDashboardPage />);
    await screen.findByText("WEIGHT-TEST");
    const headers = within(screen.getByRole("table")).getAllByRole("columnheader").map(h => h.textContent);
    expect(headers.slice(headers.indexOf("Pallets"), headers.indexOf("Pallets") + 3)).toEqual(["Pallets", "Status", "Documents"]);
    expect(within(screen.getByRole("table")).getAllByText("Not uploaded")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Financial", exact: true }));
    expect(within(screen.getByRole("table")).getByText("2.005t")).toBeTruthy();
  });
});
