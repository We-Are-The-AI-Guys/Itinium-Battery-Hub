import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import DepotFormPage, { isUnknownManufacturerValue } from "@/pages/depot-form";
import { Toaster } from "@/components/ui/toaster";

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

function installFetchMock() {
  jobPostBodies = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
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
        return Promise.resolve(jsonResponse(401, { message: "unauthenticated" }));
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
  Object.defineProperty(fileInput!, "files", { value: [file] });
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
  installFetchMock();
  trackDynamicInputs();
});

afterEach(() => {
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

describe("CSV import with 'N/A' in the Manufacturer column", () => {
  it("maps it to Unknown with TAB weights and a review flag instead of an unrecognised-value block", async () => {
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
  it("submits successfully as Unknown + review flag instead of blocking with 'Missing manufacturer name'", async () => {
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
    expect(body.batteries[0].manufacturerFlagReason).toBeTruthy();
  });
});

describe("submitting with a hand-typed 'unknown' manufacturer", () => {
  it("submits as Unknown with a review flag instead of blocking", async () => {
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
    expect(body.batteries[0].manufacturerFlagReason).toBeTruthy();
  });
});

describe("rows that contribute no weight", () => {
  it("shows a warning that zero-weight rows are excluded from the total", async () => {
    renderPage();
    await screen.findByTestId("button-upload-csv");

    const csv = [
      "Pallet Number,Asset No,Battery Serial,Manufacturer,Cell Type,Voltage",
      "P500,ASSET-ZW1,SER-ZW1,Hawker,2PZS251,24",
    ].join("\n");
    await uploadCsvViaButton(csv);

    // The unrecognised cell type opens the review dialog; import anyway.
    const importAnyway = await screen.findByText(/Import anyway and flag for review/i);
    await act(async () => {
      fireEvent.click(importAnyway);
    });

    await waitFor(() => {
      expect(screen.getByDisplayValue("SER-ZW1")).toBeInTheDocument();
    });

    await waitFor(() => {
      const warning = screen.getByTestId("text-zero-weight-warning");
      expect(warning.textContent).toMatch(/no weight/i);
      expect(warning.textContent).toMatch(/not included in the total/i);
    });
  });

  it("does not warn for a fully empty template row", async () => {
    renderPage();
    await screen.findByTestId("button-upload-csv");
    expect(screen.queryByTestId("text-zero-weight-warning")).not.toBeInTheDocument();
  });
});
