import { beforeEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CollectionsPage from "../collections";

vi.mock("@/contexts/auth-context", () => ({ useAuth: () => ({ user: { fullName: "Fictional Collector" } }) }));
vi.mock("@/components/job-documents", () => ({ JobDocumentsPanel: () => null }));
vi.mock("@/components/job-requests-panel", () => ({ JobRequestsPanel: () => null }));
let failed: boolean;
beforeEach(() => {
  failed = true;
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.endsWith("collection-sheet.pdf")) return { ok: !failed, status: failed ? 403 : 200, json: async () => ({ message: "Fixture download failure" }), headers: new Headers(), blob: async () => new Blob(["fixture"]) };
    const base = { clientName: "Fictional Client", depot: "Fictional Site", tonnage: "1.000", status: "confirmed", palletCount: 1, siteAddress: "Fictional Street", collectionDate: "2099-01-01", collectionReleasedAt: "2026-10-13", scheduleStatus: "confirmed" };
    return { ok: true, json: async () => url.endsWith("/collection/jobs") ? { jobs: [
      { ...base, id: 5, reference: "FIXTURE-5" },
      { ...base, id: 6, reference: "FIXTURE-6", scheduleStatus: "proposed" },
      { ...base, id: 7, reference: "FIXTURE-7", collectionReleasedAt: null },
      { ...base, id: 8, reference: "FIXTURE-8", collectionDate: null },
    ] } : { company: { name: "Fictional Transport" }, notifications: [], vehicles: [], drivers: [] } };
  }));
});
it("offers the unsigned sheet only for released confirmed jobs, with retry", async () => {
  render(<CollectionsPage />);
  const button = await screen.findByTestId("button-collection-sheet-5");
  for (const id of [6, 7, 8]) expect(screen.queryByTestId(`button-collection-sheet-${id}`)).not.toBeInTheDocument();
  fireEvent.click(button);
  expect(await screen.findByRole("alert")).toHaveTextContent("Fixture download failure");
  failed = false;
  fireEvent.click(screen.getByText("Retry"));
  await screen.findByText("Collection Sheet PDF");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
