import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import CustomerJobDetailPage from "../customer-job-detail";
vi.mock("wouter", () => ({
  useParams: () => ({ id: "12" }),
  Link: ({ children }: any) => <a>{children}</a>,
}));
vi.mock("@/components/sidebar-layout", () => ({ SidebarLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/job-requests-panel", () => ({ JobRequestsPanel: () => null }));
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => ({
  ok: true, json: async () => ({
    job: { id: 12, reference: "TEST", status: "confirmed", palletCount: 2 },
    batteries: [
      { id: 1, voltage: "24V", palletNumber: "P1" }, { id: 2, voltage: "48" },
      { id: 3, voltage: " 80v " }, { id: 4, voltage: null },
    ],
  }),
}))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows one voltage suffix and the supplied overview pallet count", async () => {
  render(<CustomerJobDetailPage />);
  expect(await screen.findByText("24V")).toBeInTheDocument();
  expect(screen.getAllByRole("columnheader").map(cell => cell.textContent)).toEqual([
    "Pallet", "Manufacturer", "Cell type", "Asset / serial", "Voltage", "Loose cells",
  ]);
  expect(screen.getByText("P1").closest("tr")?.firstElementChild).toHaveTextContent("P1");
  expect(screen.getByText("48V")).toBeInTheDocument();
  expect(screen.getByText("80V")).toBeInTheDocument();
  expect(screen.queryByText(/VV/)).not.toBeInTheDocument();
  expect(screen.queryByText("Download Excel")).not.toBeInTheDocument();
  expect(screen.getByText("Pallets").parentElement).toHaveTextContent("Pallets2");
});
