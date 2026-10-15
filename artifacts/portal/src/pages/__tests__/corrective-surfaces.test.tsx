import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import CustomerDashboard from "../customer-dashboard";
import StillagesPage from "../stillages";
const state = vi.hoisted(() => ({ role: "team_leader" }));
vi.mock("@/components/sidebar-layout", () => ({ SidebarLayout: ({ children, headerActions }: any) => <>{headerActions}{children}</> }));
vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: { id: 1, role: state.role, roles: [state.role], clientId: 1, permittedLocationIds: [11] } }) }));
beforeEach(() => {
  state.role = "team_leader";
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    let body: any = {};
    if (url.endsWith("/auth/me")) body = { user: { id: 1, role: state.role, roles: [state.role], clientId: 1 } };
    else if (url.startsWith("/api/stillages")) body = {
      summary: [{ locationId: 11, depot: "Authorised site", currentCount: 2, totalCollected: 3, totalDroppedOff: 1 }],
      ...(state.role === "head_office_admin" ? { totalInCirculation: 2 } : { scopedTotalInCirculation: 2 }),
      movements: [{ id: 5, locationId: 11, depot: "Authorised site", movementDate: "2026-10-14", collected: 3, droppedOff: 1, notes: "PRIVATE INTERNAL MOVEMENT" }],
      locations: [{ id: 11, name: "Authorised site" }],
    };
    else if (url.startsWith("/api/jobs?")) body = { jobs: [{
      id: 48, reference: "Fictional-48", depot: "Authorised site", tonnage: "14",
      reportingNetTonnage: "4", reportingWeightConfirmed: true,
      palletCount: 2, status: "invoice", signedDocumentTypes: ["collection_sheet", "consignment_note"],
    }] };
    else if (url.endsWith("/dashboard/stats")) body = { pendingJobs: 1, monthlyTonnage: 1, totalInvoiceValue: 999 };
    else if (url.endsWith("/job-drafts")) body = { drafts: [] };
    return { ok: true, json: async () => body };
  }));
});
describe("corrective specification customer surfaces", () => {
  it.each(["team_leader", "accounts", "lead_client"])("shows both signed files in Recent Jobs for %s, after Pallets/Status", async role => {
    state.role = role;
    render(<CustomerDashboard />);
    const table = await screen.findByRole("table");
    const viewLinks = await within(table).findAllByRole("link", { name: /View signed/ });
    expect(viewLinks).toHaveLength(2);
    expect(within(table).getByText("14,000")).toBeInTheDocument();
    expect(within(table).queryByText("4,000")).not.toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: "Pb(Kg)" })).toBeInTheDocument();
    expect(table.querySelector("thead")).not.toHaveClass("uppercase");
    expect(within(table).queryByText("Confirmed")).not.toBeInTheDocument();
    expect(within(table).queryByText("14.0t")).not.toBeInTheDocument();
    expect(within(table).getAllByRole("button", { name: /Download signed/ })).toHaveLength(2);
    const headings = within(table).getAllByRole("columnheader").map(node => node.textContent);
    expect(headings.slice(-3)).toEqual(["Pallets", "Status", "Documents"]);
    expect(screen.queryByText(/Statement to Itinium/)).not.toBeInTheDocument();
    if (role === "team_leader") expect(screen.queryByRole("tab", { name: "Financial" })).not.toBeInTheDocument();
    else {
      fireEvent.click(screen.getByRole("tab", { name: "Financial" }));
      expect(await screen.findByText("Total Invoice Value")).toBeInTheDocument();
      expect(screen.queryByText("Gross Profit")).not.toBeInTheDocument();
      expect(screen.queryByText(/Pb weight/i)).not.toBeInTheDocument();
    }
  });
  it.each(["lead_client", "accounts", "team_leader", "depot_user"])("keeps Stillages read-only and internal notes invisible to %s even with an overbroad response", async role => {
    state.role = role;
    render(<StillagesPage />);
    await screen.findByText("Stillages at authorised locations");
    expect(screen.queryByText("Movement History")).not.toBeInTheDocument();
    expect(screen.queryByText("Log Movement")).not.toBeInTheDocument();
    expect(screen.queryByText("PRIVATE INTERNAL MOVEMENT")).not.toBeInTheDocument();
    expect(screen.queryByText("Total In Circulation")).not.toBeInTheDocument();
  });
  it("retains Admin Stillages logs, notes, edit controls and global totals", async () => {
    state.role = "head_office_admin";
    render(<StillagesPage />);
    expect(await screen.findByText("PRIVATE INTERNAL MOVEMENT")).toBeInTheDocument();
    expect(screen.getByText("Movement History")).toBeInTheDocument();
    expect(screen.getByText("Log Movement")).toBeInTheDocument();
    expect(screen.getByText("Edit movement")).toBeInTheDocument();
    expect(screen.getByText("Total In Circulation")).toBeInTheDocument();
  });
});
