import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent, cleanup } from "@testing-library/react";
import KpiPage from "../kpi";
const state = vi.hoisted(() => ({ role: "accounts" }));
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: { role: state.role } }) }));
vi.mock("@/components/sidebar-layout", () => ({ SidebarLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("recharts", () => {
  const Container = ({ children, data }: any) => <div>{data && <span data-testid="chart-data">{JSON.stringify(data)}</span>}{children}</div>;
  const Series = ({ dataKey }: any) => <span>{dataKey}</span>;
  const Empty = () => null;
  return { BarChart: Container, ComposedChart: Container, ResponsiveContainer: Container, Bar: Series,
    Line: Series, XAxis: Empty, YAxis: Empty, CartesianGrid: Empty, Tooltip: Empty, Legend: Empty };
});
const metrics = { jobCount: 2, tonnage: 3, invoiceValue: 100, grossProfit: 20, grossMarginPct: 20,
  avgCblLmePct: 65, avgDaysToPay: 10, overdueCount: 1, overdueValue: 10 };
beforeEach(() => {
  state.role = "accounts";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => ({
    ok: true, json: async () => url.includes("/auth/me") ? { user: { role: state.role } } :
      url.includes("/clients") ? { clients: [] } :
      { totals: metrics, months: [{ month: "2026-10", ...metrics }], statusBreakdown: { completed: 2 } },
  })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("KPI controls and visibility", () => {
  it("omits internal cards, table columns and chart series for customers even if data contains them", async () => {
    render(<KpiPage />);
    await screen.findByText("Total Jobs");
    for (const label of ["Gross Profit", "Gross Margin", "Overdue Invoices", "Avg CBL LME %", "Margin", "Avg LME %"]) {
      expect(screen.queryByText(label)).not.toBeInTheDocument();
    }
    for (const chart of screen.getAllByTestId("chart-data")) expect(chart.textContent).not.toContain("Gross Profit");
  });
  it("retains internal metrics for Itinium", async () => {
    state.role = "head_office_admin";
    render(<KpiPage />);
    expect(await screen.findByText("Gross Margin")).toBeInTheDocument();
    expect(screen.getByText("Overdue Invoices")).toBeInTheDocument();
    expect(screen.getAllByText("Gross Profit").length).toBeGreaterThan(0);
  });
  it("sends exact custom dates and validates reversed ranges", async () => {
    render(<KpiPage />);
    await screen.findByText("Total Jobs");
    fireEvent.click(screen.getByText("Custom"));
    fireEvent.change(screen.getByLabelText("Start date"), { target: { value: "2026-10-06" } });
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-10-12" } });
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("from=2026-10-06&to=2026-10-12"), expect.anything()));
    fireEvent.change(screen.getByLabelText("End date"), { target: { value: "2026-10-05" } });
    expect(screen.getByRole("alert")).toHaveTextContent("end on or after the start");
  });
});
