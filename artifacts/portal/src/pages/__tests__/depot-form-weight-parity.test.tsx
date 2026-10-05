import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import DepotFormPage from "@/pages/depot-form";
import { Toaster } from "@/components/ui/toaster";

// Regression for the manual-entry vs CSV weight discrepancy (Ingrid, 11 Aug
// 2026): the server now re-derives auto weights from the catalogue at submit,
// but only when the client marks the row's weight as auto-computed. These
// tests pin the client contract: `weightManual` must be false for
// auto-computed weights and true when the weight was supplied by the user
// (e.g. a CSV weight column), so the server never overrides a manual weight
// and never trusts a possibly-stale auto weight.

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
    manufacturer: "Exide / GNB",
    modelName: "5 EPzS 700",
    cellFamily: "EPzS",
    cellHeightMm: 700,
    cellsCount: 5,
    weightPerCellKg: "30.900",
  },
  {
    id: 2,
    manufacturer: "Exide / GNB",
    modelName: "5 EPzS 775",
    cellFamily: "EPzS",
    cellHeightMm: 775,
    cellsCount: 5,
    weightPerCellKg: "32.900",
  },
];

const MANUFACTURERS = {
  manufacturers: ["Exide / GNB", "TAB", "Other"],
  aliases: {},
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
        return Promise.resolve(jsonResponse(200, {
          user: { id: 1, email: "test@example.invalid", fullName: "Test User", role: "depot_user", clientId: null, locationId: null },
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

describe("weight parity: submit payload weightManual flag", () => {
  it("sends weightManual=false for auto-computed weights so the server re-derives them", async () => {
    renderPage();
    await screen.findByTestId("button-upload-csv");

    const csv = [
      "Pallet Number,Asset No,Battery Serial,Manufacturer,Cell Type,Voltage",
      "P1,ASSET-1,SER-1,Exide / GNB,5 EPzS 700,48",
    ].join("\n");
    await uploadCsvViaButton(csv);

    await screen.findByText("CSV imported");
    // Auto weight: 30.9 kg/cell x 24 cells x 1.4 = 1038.2 kg gross
    await waitFor(() => {
      expect(screen.getAllByText(/1\.038t/).length).toBeGreaterThanOrEqual(1);
    });

    fireEvent.click(screen.getByTestId("button-submit-collection"));
    await waitFor(() => {
      expect(jobPostBodies.length).toBe(1);
    });

    const body = jobPostBodies[0] as {
      batteries: Array<{ cellType: string | null; estimatedWeightKg: string | null; weightManual: boolean }>;
    };
    expect(body.batteries[0].cellType).toBe("5 EPzS 700");
    // Raw (pre-1.4) per-battery weight: 30.9 x 24 = 741.6
    expect(parseFloat(body.batteries[0].estimatedWeightKg || "")).toBeCloseTo(741.6, 1);
    expect(body.batteries[0].weightManual).toBe(false);
  });

  it("sends weightManual=true when the CSV supplies a weight, so the server keeps it", async () => {
    renderPage();
    await screen.findByTestId("button-upload-csv");

    const csv = [
      "Pallet Number,Asset No,Battery Serial,Manufacturer,Cell Type,Voltage,Weight",
      "P2,ASSET-2,SER-2,Exide / GNB,5 EPzS 700,48,555",
    ].join("\n");
    await uploadCsvViaButton(csv);

    await screen.findByText("CSV imported");
    await waitFor(() => {
      expect(screen.getByDisplayValue("SER-2")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId("button-submit-collection"));
    await waitFor(() => {
      expect(jobPostBodies.length).toBe(1);
    });

    const body = jobPostBodies[0] as {
      batteries: Array<{ estimatedWeightKg: string | null; weightManual: boolean }>;
    };
    expect(parseFloat(body.batteries[0].estimatedWeightKg || "")).toBeCloseTo(555, 1);
    expect(body.batteries[0].weightManual).toBe(true);
  });

  it("submits unknown loose cells with a manual token weight for review", async () => {
    renderPage();
    await screen.findByTestId("button-upload-csv");

    const csv = [
      "Pallet Number,Asset No,Battery Serial,Manufacturer,Loose Cells Qty,Cell Type,Weight",
      "P3,ASSET-3,N/A,Exide / GNB,15,Unknown loose cells,500",
    ].join("\n");
    await uploadCsvViaButton(csv);

    await screen.findByText("CSV imported");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("button-submit-collection"));
    await waitFor(() => {
      expect(jobPostBodies.length).toBe(1);
    });

    const body = jobPostBodies[0] as {
      batteries: Array<{
        cellType: string | null;
        looseCellsQty: string | null;
        estimatedWeightKg: string | null;
        weightManual: boolean;
        isLooseCells: boolean;
        cellModelFlagReason: string | null;
      }>;
    };
    expect(body.batteries[0]).toMatchObject({
      cellType: "Unknown loose cells",
      looseCellsQty: "15",
      estimatedWeightKg: "500",
      weightManual: true,
      isLooseCells: true,
    });
    expect(body.batteries[0].cellModelFlagReason).toBeTruthy();
  });
});
