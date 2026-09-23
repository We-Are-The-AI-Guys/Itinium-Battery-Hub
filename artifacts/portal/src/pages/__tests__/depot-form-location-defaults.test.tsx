import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import DepotFormPage from "@/pages/depot-form";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const locations = [
  {
    id: 11,
    name: "Birmingham",
    address: "Unit 1, Birmingham",
    siteContacts: null,
    siteContactName: "John Smith",
    siteContactPhone: "07700 111111",
    siteContact2Name: "Jane Jones",
    siteContact2Phone: "07700 222222",
    siteContact3Name: "Sam Green",
    siteContact3Phone: "07700 333333",
    siteHours: "Mon–Fri 07:00–16:00",
    specialInstructions: "Report to the gatehouse",
  },
  {
    id: 12,
    name: "Leeds",
    address: "Unit 2, Leeds",
    siteContacts: null,
    siteContactName: "Leeds Contact",
    siteContactPhone: "0113 123 4567",
    siteContact2Name: null,
    siteContact2Phone: null,
    siteContact3Name: null,
    siteContact3Phone: null,
    siteHours: "Mon–Thu 08:00–17:00",
    specialInstructions: "Use the rear entrance",
  },
];

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/auth/me")) {
        return Promise.resolve(jsonResponse(200, {
          user: {
            id: 1,
            email: "leader@example.com",
            fullName: "Team Leader",
            role: "team_leader",
            depot: null,
            clientId: 5,
            locationId: 11,
            clientName: "Example Client",
            locationName: "Birmingham",
          },
        }));
      }
      if (url.includes("/api/clients/5/locations")) {
        return Promise.resolve(jsonResponse(200, { locations }));
      }
      if (url.includes("/api/manufacturers")) {
        return Promise.resolve(jsonResponse(200, { manufacturers: [], aliases: {} }));
      }
      if (url.includes("/api/cell-models")) {
        return Promise.resolve(jsonResponse(200, { models: [] }));
      }
      if (url.includes("/api/collection-points")) {
        return Promise.resolve(jsonResponse(200, { collectionPoints: [] }));
      }
      return Promise.resolve(jsonResponse(404, { message: "not found" }));
    })
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("customer job location defaults", () => {
  it("loads all saved location details and keeps them editable for this job", async () => {
    const { container } = render(<DepotFormPage />);

    expect(await screen.findByTestId("input-collection-point")).toHaveValue("Unit 1, Birmingham");
    expect(screen.getByTestId("input-site-contacts")).toHaveValue(
      "John Smith — 07700 111111\nJane Jones — 07700 222222\nSam Green — 07700 333333"
    );
    expect(screen.getByTestId("input-site-hours")).toHaveValue("Mon–Fri 07:00–16:00");
    expect(screen.getByTestId("input-special-instructions")).toHaveValue("Report to the gatehouse");

    fireEvent.change(screen.getByTestId("input-site-hours"), {
      target: { value: "Friday collection only" },
    });
    expect(screen.getByTestId("input-site-hours")).toHaveValue("Friday collection only");

    const locationSelect = container.querySelector("select");
    expect(locationSelect).toBeTruthy();
    fireEvent.change(locationSelect!, { target: { value: "12" } });

    await waitFor(() => {
      expect(screen.getByTestId("input-collection-point")).toHaveValue("Unit 2, Leeds");
      expect(screen.getByTestId("input-site-contacts")).toHaveValue("Leeds Contact — 0113 123 4567");
      expect(screen.getByTestId("input-site-hours")).toHaveValue("Mon–Thu 08:00–17:00");
      expect(screen.getByTestId("input-special-instructions")).toHaveValue("Use the rear entrance");
    });
  });
});