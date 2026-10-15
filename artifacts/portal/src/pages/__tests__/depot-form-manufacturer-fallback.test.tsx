import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import DepotFormPage, { getLoadState, isUnknownManufacturerValue } from "@/pages/depot-form";
import { Toaster } from "@/components/ui/toaster";
import { JOB_NOTES_DESCRIPTION } from "@/lib/collection-notes-copy";

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

const CELL_MODELS = [
  {
    id: 1,
    manufacturer: "EnerSys / Hawker",
    modelName: "4 PzS 460",
    cellFamily: "PzS",
    cellHeightMm: 460,
    cellsCount: 4,
    weightPerCellKg: "19.900",
  },
  {
    id: 2,
    manufacturer: "TAB",
    modelName: "4 PzS 460",
    cellFamily: "PzS",
    cellHeightMm: 460,
    cellsCount: 4,
    weightPerCellKg: "19.900",
  },
];

const MANUFACTURERS = {
  manufacturers: [
    "EnerSys / Hawker",
    "Espex",
    "Exide / GNB",
    "Hoppecke",
    "TAB",
    "Other",
  ],
  aliases: {
    Hawker: "EnerSys / Hawker",
  },
};

let createdInputs: HTMLInputElement[];
let originalCreateElement: typeof document.createElement;
let jobPostBodies: unknown[];
let userRole: string;
let savedDraftForm: Record<string, unknown> | null;

function installFetchMock() {
  jobPostBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/clients/1/locations")) return Promise.resolve(jsonResponse(200, {
        locations: [{ id: 11, clientId: 1, name: "Fixture Test Depot", address: "Fixture address" }],
      }));
      if (url.includes("/api/job-drafts")) {
        if (init?.method === "POST") {
          savedDraftForm = JSON.parse(String(init.body)).formData;
          return Promise.resolve(jsonResponse(200, { draft: { id: 42 } }));
        }
        return Promise.resolve(jsonResponse(200, {
          drafts: savedDraftForm ? [{ id: 42, formData: savedDraftForm }] : [],
        }));
      }
      if (url.includes("/api/cell-models")) {
        return Promise.resolve(jsonResponse(200, { models: CELL_MODELS }));
      }
      if (url.includes("/api/manufacturers")) {
        return Promise.resolve(jsonResponse(200, MANUFACTURERS));
      }
      if (url.includes("/api/collection-points")) {
        return Promise.resolve(jsonResponse(200, { collectionPoints: [] }));
      }
      if (url.includes("/api/auth/me")) {
        return Promise.resolve(jsonResponse(200, {
          user: { id: 1, email: "test@example.invalid", fullName: "Test User", role: userRole, clientId: 1, locationId: 11, permittedLocationIds: [11] },
        }));
      }
      if (url.includes("/api/jobs") && init?.method === "POST") {
        jobPostBodies.push(JSON.parse(String(init.body)));
        return Promise.resolve(
          jsonResponse(200, { job: { reference: "JOB-TEST-1" } })
        );
      }
      return Promise.resolve(jsonResponse(404, { message: "not found" }));
    })
  );
}

function trackDynamicInputs() {
  createdInputs = [];
  originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(
    (tagName: string, options?: ElementCreationOptions) => {
      const el = originalCreateElement(tagName, options);
      if (tagName.toLowerCase() === "input") {
        createdInputs.push(el as HTMLInputElement);
      }
      return el;
    }
  );
}

async function uploadCsvViaButton(csvContent: string) {
  const uploadButton = screen.getByTestId("button-upload-csv");
  fireEvent.click(uploadButton);

  const fileInput = [...createdInputs]
    .reverse()
    .find((el) => el.type === "file" && !document.contains(el));
  expect(fileInput, "dynamically created file input").toBeTruthy();

  const file = new File([csvContent], "batteries.csv", { type: "text/csv" });
  Object.defineProperty(fileInput!, "files", { value: [file], configurable: true });
  await act(async () => {
    fileInput!.onchange?.({ target: fileInput } as unknown as Event);
  });
}

function renderPage() {
  return render(
    <>
      <DepotFormPage />
      <Toaster />
    </>
  );
}

beforeEach(() => {
  window.history.replaceState({}, "", "/collection/new");
  savedDraftForm = null;
  userRole = "depot_user";
  installFetchMock();
  trackDynamicInputs();
});

afterEach(() => {
  window.history.replaceState({}, "", "/collection/new");
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("isUnknownManufacturerValue", () => {
  it("treats placeholder values as unknown", () => {
    for (const v of ["N/A", "n/a", "na", "Unknown", "unknown", "Other", "none", "-", "?", " N/A "]) {
      expect(isUnknownManufacturerValue(v), v).toBe(true);
    }
  });
  it("does not treat real manufacturer names as unknown", () => {
    for (const v of ["Hoppecke", "TAB", "EnerSys / Hawker", "Natrium"]) {
      expect(isUnknownManufacturerValue(v), v).toBe(false);
    }
  });
});

describe("one CSV upload per collection request", () => {
  const csv = [
    "Pallet Number,Asset No,Battery Serial,Manufacturer,Cell Type,Voltage",
    "P1,ASSET-CSV,SER-CSV,Hawker,4PzS460,24",
  ].join("\n");

  it("ignores repeat file callbacks after a successful import", async () => {
    renderPage();
    await screen.findByTestId("button-upload-csv");
    await uploadCsvViaButton(csv);
    await screen.findByText("CSV imported");
    expect(screen.getByTestId("button-upload-csv")).toBeDisabled();
    // Reuse the original file input to exercise the handler guard, not just
    // the disabled button.
    await uploadCsvViaButton(csv);
    expect(screen.getAllByDisplayValue("SER-CSV")).toHaveLength(1);
    expect(screen.getByText(/Only one CSV upload/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("button-submit-collection")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("button-submit-collection"));
    await screen.findByText("Collection submitted");
    expect(jobPostBodies).toHaveLength(1);
    expect(screen.getByTestId("button-upload-csv")).not.toBeDisabled();
  });

  it("allows retry after an invalid CSV and after cancelling internal review", async () => {
    userRole = "head_office_admin";
    renderPage();
    await screen.findByTestId("button-upload-csv");
    await uploadCsvViaButton("");
    await screen.findByText("Empty CSV");
    expect(screen.getByTestId("button-upload-csv")).not.toBeDisabled();
    await uploadCsvViaButton("Asset No,Battery Serial\nA,B");
    await screen.findByTestId("button-csv-validation-cancel");
    fireEvent.click(screen.getByTestId("button-csv-validation-cancel"));
    expect(screen.getByTestId("button-upload-csv")).not.toBeDisabled();
    await uploadCsvViaButton(csv);
    await screen.findByText("CSV imported");
    expect(screen.getByTestId("button-upload-csv")).toBeDisabled();
  });

  it("persists the upload lock when saving and reopening a draft", async () => {
    const page = renderPage();
    await screen.findByTestId("button-upload-csv");
    await uploadCsvViaButton(csv);
    await screen.findByText("CSV imported");
    await screen.findByDisplayValue("SER-CSV");
    await waitFor(() => expect(screen.getByTestId("button-save-draft")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("button-save-draft"));
    await waitFor(() => expect(savedDraftForm?.csvImported).toBe(true));
    expect(savedDraftForm?.csvImported).toBe(true);
    page.unmount();
    window.history.replaceState({}, "", "/collection/new?draft=42");
    renderPage();
    await screen.findByDisplayValue("SER-CSV");
    expect(screen.getByTestId("button-upload-csv")).toBeDisabled();
  });

  it("allows the first upload on a saved manual-only draft", async () => {
    const page = renderPage();
    await screen.findByTestId("button-upload-csv");
    fireEvent.click(screen.getByTestId("button-save-draft"));
    await waitFor(() => expect(savedDraftForm?.csvImported).toBe(false));
    expect(savedDraftForm?.csvImported).toBe(false);
    page.unmount();
    window.history.replaceState({}, "", "/collection/new?draft=42");
    renderPage();
    await waitFor(() => expect(screen.getByTestId("button-upload-csv")).not.toBeDisabled());
    await uploadCsvViaButton(csv);
    await screen.findByText("CSV imported");
    expect(screen.getByTestId("button-upload-csv")).toBeDisabled();
  });

  it("protects populated legacy drafts whose import history is unknown", async () => {
    const page = renderPage();
    await screen.findByTestId("button-upload-csv");
    await uploadCsvViaButton(csv);
    await screen.findByText("CSV imported");
    await screen.findByDisplayValue("SER-CSV");
    await waitFor(() => expect(screen.getByTestId("button-save-draft")).not.toBeDisabled());
    fireEvent.click(screen.getByTestId("button-save-draft"));
    await waitFor(() => expect(savedDraftForm?.csvImported).toBe(true));
    delete savedDraftForm!.csvImported;
    page.unmount();
    window.history.replaceState({}, "", "/collection/new?draft=42");
    renderPage();
    await screen.findByDisplayValue("SER-CSV");
    expect(screen.getByTestId("button-upload-csv")).toBeDisabled();
  });
});

describe("minimum load warning thresholds", () => {
  it("does not show the approaching-minimum state once the load reaches 10 tonnes", () => {
    expect(getLoadState(9.6)).toBe("amber-low");
    expect(getLoadState(10)).toBe("green");
    expect(getLoadState(10.6)).toBe("green");
  });
});

describe("voltage keyboard selection", () => {
  it.each([
    ["24", "24V"],
    ["48", "48V"],
  ])("selects %sV when the user types %s and presses Tab", async (typed, expected) => {
    renderPage();
    const voltageInput = await screen.findByTestId("input-voltage-0");
    fireEvent.change(voltageInput, { target: { value: typed } });
    fireEvent.keyDown(voltageInput, { key: "Tab", code: "Tab" });
    await waitFor(() => expect(voltageInput).toHaveValue(expected));
  });
});

describe("CSV import with 'N/A' in the Manufacturer column", () => {
  it("maps it to Unknown with TAB weights without a manufacturer review", async () => {
    renderPage();
    await screen.findByTestId("button-upload-csv");

    const csv = [
      "Pallet Number,Asset No,Battery Serial,Manufacturer,Cell Type,Voltage",
      "P300,ASSET-NA1,SER-NA1,N/A,4PzS460,24",
    ].join("\n");
    await uploadCsvViaButton(csv);

    await screen.findByText("CSV imported");
    await waitFor(() => {
      expect(screen.getByDisplayValue("SER-NA1")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("Unknown")).toBeInTheDocument();
    // Gross load from TAB catalogue: 19.9 kg/cell x 12 cells x 1.4 = 334.3 kg
    await waitFor(() => {
      expect(screen.getAllByText(/0\.334t/).length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("submitting with an 'Other' manufacturer and no custom name", () => {
  it("submits successfully as Unknown without a manufacturer review", async () => {
    renderPage();
    await screen.findByTestId("button-upload-csv");

    const csv = [
      "Pallet Number,Asset No,Battery Serial,Manufacturer,Cell Type,Voltage",
      "P400,ASSET-OT1,SER-OT1,Other,4PzS460,24",
    ].join("\n");
    await uploadCsvViaButton(csv);

    await screen.findByText("CSV imported");
    await waitFor(() => {
      expect(screen.getByDisplayValue("SER-OT1")).toBeInTheDocument();
    });
    // Wait for auto-weight so the missing-weight guard doesn't trip.
    await waitFor(() => {
      expect(screen.getAllByText(/0\.334t/).length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByTestId("button-submit-collection"));

    await waitFor(() => {
      expect(jobPostBodies.length).toBe(1);
    });
    expect(screen.queryByText("Missing manufacturer name")).not.toBeInTheDocument();
    const body = jobPostBodies[0] as {
      batteries: Array<{ manufacture: string | null; manufacturerFlagReason: string | null }>;
    };
    expect(body.batteries[0].manufacture).toBe("Unknown");
    expect(body.batteries[0].manufacturerFlagReason).toBeNull();
  });
});

describe("submitting with a hand-typed 'unknown' manufacturer", () => {
  it("submits as Unknown using TAB without a manufacturer review", async () => {
    renderPage();
    await screen.findByTestId("button-upload-csv");

    const csv = [
      "Pallet Number,Asset No,Battery Serial,Manufacturer,Cell Type,Voltage",
      "P450,ASSET-UK1,SER-UK1,unknown,4PzS460,24",
    ].join("\n");
    await uploadCsvViaButton(csv);

    await screen.findByText("CSV imported");
    await waitFor(() => {
      expect(screen.getByDisplayValue("SER-UK1")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getAllByText(/0\.334t/).length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByTestId("button-submit-collection"));

    await waitFor(() => {
      expect(jobPostBodies.length).toBe(1);
    });
    const body = jobPostBodies[0] as {
      batteries: Array<{ manufacture: string | null; manufacturerFlagReason: string | null }>;
    };
    expect(body.batteries[0].manufacture).toBe("Unknown");
    expect(body.batteries[0].manufacturerFlagReason).toBeNull();
  });
});

describe("rows that contribute no weight", () => {
  it("includes a provisional allowance but blocks an unverified customer load", async () => {
    renderPage();
    await screen.findByTestId("button-upload-csv");

    const csv = [
      "Pallet Number,Asset No,Battery Serial,Manufacturer,Cell Type,Voltage",
      "P500,ASSET-ZW1,SER-ZW1,Hawker,2PZS251,24",
    ].join("\n");
    await uploadCsvViaButton(csv);

    await screen.findByText("CSV imported");

    await waitFor(() => {
      expect(screen.getByDisplayValue("SER-ZW1")).toBeInTheDocument();
    });

    expect(screen.getByTestId("text-zero-weight-warning")).toHaveTextContent("Admin must verify");
    expect(screen.queryByText("Needs Review")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-submit-collection"));
    expect(screen.getByTestId("button-submit-collection")).toBeDisabled();
    expect(screen.getByTestId("button-save-draft")).not.toBeDisabled();
    expect(jobPostBodies).toHaveLength(0);
    // V16: explicit acknowledgement unlocks a provisional submission for Admin verification.
    fireEvent.click(screen.getByTestId("checkbox-provisional-ack"));
    expect(screen.getByTestId("button-submit-collection")).not.toBeDisabled();
  });

  it("does not warn for a fully empty template row", async () => {
    renderPage();
    await screen.findByTestId("button-upload-csv");
    expect(screen.queryByTestId("text-zero-weight-warning")).not.toBeInTheDocument();
  });
});

describe("CSV review feedback by role", () => {
  it.each(["depot_user", "team_leader", "accounts", "head_office_admin"])(
    "never exposes the per-battery estimated-weight input on the request form for %s",
    async (role) => {
      userRole = role;
      renderPage();
      await screen.findByTestId("button-upload-csv");
      await uploadCsvViaButton([
        "Pallet Number,Asset No,Battery Serial,Manufacturer,Cell Type,Voltage",
        "P1,ASSET-W,SER-W,Hawker,4PzS460,24",
      ].join("\n"));
      await screen.findByText("CSV imported");
      await waitFor(() => expect(screen.getAllByText(/0\.334t/).length).toBeGreaterThan(0));
      expect(screen.queryByText("Estimated Weight (kg)")).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Calculated or enter manually")).not.toBeInTheDocument();
      expect(screen.queryByTestId("input-estimated-weight-0")).not.toBeInTheDocument();
    },
  );

  const reviewCsv = [
    "Pallet Number,Asset No,Battery Serial,Manufacturer,Cell Type,Voltage",
    "P1,ASSET-OK,SER-OK,Hawker,4PzS460,24",
    "P2,ASSET-MISSING,SER-MISSING,,,",
    "P3,ASSET-UNKNOWN,SER-UNKNOWN,Unlisted maker,Unlisted model,30",
  ].join("\n");

  it.each(["depot_user", "team_leader"])(
    "lets %s import without catalogue review prompts but blocks unverified weights",
    async (role) => {
      userRole = role;
      renderPage();
      await screen.findByTestId("button-upload-csv");
      await uploadCsvViaButton(reviewCsv);
      await screen.findByText("CSV imported");
      await screen.findByDisplayValue("SER-UNKNOWN");

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(screen.queryByText(/Needs Review|flagged for Itinium review|Missing from CSV|Unrecognised value/i)).not.toBeInTheDocument();
      expect(screen.getByTestId("text-zero-weight-warning")).toHaveTextContent("not a verified weight");
      expect(screen.getByTestId("battery-row-2").className).not.toContain("border-l-amber");
      expect(screen.getByDisplayValue("Unlisted maker")).toBeInTheDocument();
      expect(screen.getByText("Unlisted model")).toBeInTheDocument();
      await waitFor(() => expect(screen.getAllByText(/1\.734t/).length).toBeGreaterThan(0));

      fireEvent.click(screen.getByTestId("button-submit-collection"));
      expect(screen.getByTestId("button-submit-collection")).toBeDisabled();
      expect(jobPostBodies).toHaveLength(0);
      expect(screen.queryByTestId("input-estimated-weight-0")).not.toBeInTheDocument();
      expect(screen.queryByTestId("section-tonnage-override")).not.toBeInTheDocument();
      expect(screen.queryByText("Unrecognised fields must be resolved")).not.toBeInTheDocument();
    },
  );

  it.each(["head_office_admin"])(
    "keeps the import review window and row warnings available to %s",
    async (role) => {
      userRole = role;
      renderPage();
      await screen.findByTestId("button-upload-csv");
      await uploadCsvViaButton(reviewCsv);
      expect(await screen.findByRole("dialog")).toBeInTheDocument();
      expect(screen.getByText("CSV rows need attention")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: /Import anyway and flag for review/i }));
      await screen.findByText("CSV imported");
      expect(screen.getAllByText("Needs Review")).toHaveLength(2);
      expect(screen.getByTestId("text-zero-weight-warning")).toBeInTheDocument();
      expect(screen.getByText(/flagged for Itinium review/)).toBeInTheDocument();
    },
  );

  it.each([
    ["empty file", "", "Empty CSV"],
    ["missing required columns", "Manufacturer,Cell Type\nHawker,PzS", "Missing required columns"],
  ])("still explains an upload failure for a client: %s", async (_case, csv, message) => {
    renderPage();
    await screen.findByTestId("button-upload-csv");
    await uploadCsvViaButton(csv);
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByText("CSV imported")).not.toBeInTheDocument();
    expect(jobPostBodies).toHaveLength(0);
  });

  it("still blocks loads above the maximum capacity for clients", async () => {
    renderPage();
    await screen.findByTestId("button-upload-csv");
    await uploadCsvViaButton([
      "Pallet Number,Asset No,Battery Serial,Manufacturer,Cell Type,Voltage,Weight",
      "P1,ASSET-HEAVY,SER-HEAVY,Hawker,4PzS460,24,30000",
    ].join("\n"));
    await screen.findByText("CSV imported");
    expect(screen.queryByText(/Manual\/token weight/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("button-submit-collection"));
    expect(screen.getByTestId("button-submit-collection")).toBeDisabled();
    expect(screen.getByTestId("load-guidance")).toHaveTextContent("separate new collection job");
    expect(screen.getByTestId("load-guidance")).toHaveTextContent("Contact Itinium directly");
    expect(jobPostBodies).toHaveLength(0);
  });
});

describe("client job notes explanation", () => {
  it("explains who can read notes while preserving normal text entry", async () => {
    renderPage();
    const notes = await screen.findByRole("textbox", { name: "Internal notes" });
    expect(notes).toHaveAccessibleDescription(JOB_NOTES_DESCRIPTION);
    fireEvent.change(notes, { target: { value: "Use the loading bay." } });
    expect(notes).toHaveValue("Use the loading bay.");
  });
});
