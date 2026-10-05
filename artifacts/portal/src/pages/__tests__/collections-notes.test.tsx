import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CollectionsPage from "@/pages/collections";
import { JOB_NOTES_DESCRIPTION } from "@/lib/collection-notes-copy";

vi.mock("@/contexts/auth-context", () => ({
  useAuth: () => ({ user: { fullName: "Transport User" } }),
}));

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  } as Response;
}

function collectionJob(id: number, notes: string | null) {
  return {
    id,
    reference: `JOB-${String(id).padStart(4, "0")}`,
    clientName: "Example Client",
    depot: "North Depot",
    collectionPoint: null,
    collectionDate: null,
    proposedCollectionDate: null,
    scheduleStatus: "unassigned",
    driverName: null,
    vehicleReg: null,
    siteContacts: null,
    siteHours: null,
    specialInstructions: id === 41 ? "Use rear gate" : null,
    notes,
    tonnage: "1.200",
    status: "request",
    submittedAt: "2026-09-23T10:00:00Z",
    siteAddress: "Example Road",
  };
}

describe("collection partner internal notes", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/collection/jobs")) {
          return Promise.resolve(jsonResponse({
            jobs: [
              collectionJob(41, "  Call the requester before entering the loading area.  "),
              collectionJob(42, null),
              collectionJob(43, ""),
              collectionJob(44, "   "),
            ],
          }));
        }
        return Promise.resolve(jsonResponse({
          company: { name: "Example Transport" },
          vehicles: [],
          drivers: [],
        }));
      })
    );
  });

  it("shows saved internal notes with existing instructions", async () => {
    render(<CollectionsPage />);
    expect(await screen.findByText("Use rear gate")).toBeInTheDocument();
    expect(screen.getByText("Internal notes")).toBeInTheDocument();
    expect(screen.getByText(JOB_NOTES_DESCRIPTION)).toBeInTheDocument();
    expect(
      screen.getByText("Call the requester before entering the loading area.")
    ).toBeInTheDocument();
    expect(screen.getAllByText("Internal notes")).toHaveLength(1);
    expect(screen.queryByTestId("internal-notes-42")).not.toBeInTheDocument();
    expect(screen.queryByTestId("internal-notes-43")).not.toBeInTheDocument();
    expect(screen.queryByTestId("internal-notes-44")).not.toBeInTheDocument();
  });
});