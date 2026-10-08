import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AdminDashboardPage from "../admin-dashboard";
import { formatCustomerPbWeight } from "@/lib/customer-pb-weight";

vi.mock("@/components/sidebar-layout", () => ({
  SidebarLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()] }));

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
    fireEvent.click(screen.getByRole("button", { name: "Financial", exact: true }));
    expect(table.getByRole("columnheader", { name: "Customer Pb weight (t)" })).toBeTruthy();
    expect(table.getByText("1.240t")).toBeTruthy();
    expect(table.queryByText("9.9t")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Request", exact: true }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/jobs?status=request&limit=8&offset=0", expect.anything()));
    fireEvent.click(screen.getByRole("button", { name: "2", exact: true }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/jobs?status=request&limit=8&offset=8", expect.anything()));
    expect(table.getByText("1.240t")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Operational", exact: true }));
    expect(table.getByText("9.9t")).toBeTruthy();
    view.unmount();
    traction = "2.000"; blocs = "0.005";
    render(<AdminDashboardPage />);
    await screen.findByText("WEIGHT-TEST");
    fireEvent.click(screen.getByRole("button", { name: "Financial", exact: true }));
    expect(within(screen.getByRole("table")).getByText("2.005t")).toBeTruthy();
  });
});
