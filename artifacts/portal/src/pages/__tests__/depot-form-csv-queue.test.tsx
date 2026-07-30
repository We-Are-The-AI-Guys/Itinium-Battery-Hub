import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent, act } from "@testing-library/react";
import DepotFormPage from "@/pages/depot-form";
import { Toaster } from "@/components/ui/toaster";

type Deferred = {
  promise: Promise<Response>;
  resolve: (value: Response) => void;
};

function createDeferred(): Deferred {
  let resolve!: (value: Response) => void;
  const promise = new Promise<Response>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

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
    EnerSys: "EnerSys / Hawker",
    GNB: "Exide / GNB",
    Exide: "Exide / GNB",
  },
};

const CSV_CONTENT = [
  "Pallet Number,Asset No,Battery Serial,Manufacturer,Cell Type,Voltage",
  "P100,ASSET-UT1,SER-UT1,Hawker,4PzS460,24",
].join("\n");

let cellModelDeferreds: Deferred[];
let createdInputs: HTMLInputElement[];
let originalCreateElement: typeof document.createElement;

function installFetchMock() {
  cellModelDeferreds = [];
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/cell-models")) {
        const deferred = createDeferred();
        cellModelDeferreds.push(deferred);
        return deferred.promise;
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

async function uploadCsvViaButton(csvContent: string = CSV_CONTENT) {
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

describe("CSV import while the cell-model catalogue is still loading", () => {
  it("queues the import and processes it once the catalogue arrives, filling weights and a non-zero total load", async () => {
    renderPage();

    await screen.findByTestId("button-upload-csv");
    expect(cellModelDeferreds.length).toBeGreaterThanOrEqual(1);

    await uploadCsvViaButton();

    await screen.findByText("Preparing import");
    expect(screen.queryByDisplayValue("SER-UT1")).not.toBeInTheDocument();

    await act(async () => {
      cellModelDeferreds[0].resolve(jsonResponse(200, { models: CELL_MODELS }));
    });

    await screen.findByText("CSV imported");

    await waitFor(() => {
      expect(screen.getByDisplayValue("SER-UT1")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("EnerSys / Hawker")).toBeInTheDocument();

    // Depot users see the actual battery weight (19.9 kg/cell x 12 cells =
    // 238.8 kg); the x1.4 safe-load figure is applied server-side only.
    await waitFor(() => {
      expect(screen.getAllByText(/0\.239t/).length).toBeGreaterThanOrEqual(1);
    });
    expect(screen.queryByText(/^0\.000t/)).not.toBeInTheDocument();
  });
});

describe("CSV import with an empty Manufacturer column", () => {
  it("imports the row, defaults the manufacturer to Unknown, and flags it for Itinium review", async () => {
    renderPage();

    await screen.findByTestId("button-upload-csv");
    expect(cellModelDeferreds.length).toBeGreaterThanOrEqual(1);

    const csv = [
      "Pallet Number,Asset No,Battery Serial,Manufacturer,Cell Type,Voltage",
      "P200,ASSET-UT2,SER-UT2,,4PzS460,24",
    ].join("\n");
    await uploadCsvViaButton(csv);

    await screen.findByText("Preparing import");
    await act(async () => {
      cellModelDeferreds[0].resolve(jsonResponse(200, { models: CELL_MODELS }));
    });

    await screen.findByText("CSV imported");

    await waitFor(() => {
      expect(screen.getByDisplayValue("SER-UT2")).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue("Unknown")).toBeInTheDocument();
    expect(screen.getByText("Needs Review")).toBeInTheDocument();
  });
});

describe("CSV import when the cell-model catalogue fails to load", () => {
  it("retries once, then cancels the import with a destructive error toast and adds no rows", async () => {
    renderPage();

    await screen.findByTestId("button-upload-csv");
    expect(cellModelDeferreds.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      cellModelDeferreds[0].resolve(jsonResponse(500, { message: "boom" }));
    });

    await uploadCsvViaButton();

    await screen.findByText("Retrying data load");

    await waitFor(() => {
      expect(cellModelDeferreds.length).toBeGreaterThanOrEqual(2);
    });
    await act(async () => {
      cellModelDeferreds[1].resolve(jsonResponse(500, { message: "boom" }));
    });

    const errorTitle = await screen.findByText("Reference data unavailable");
    expect(
      screen.getByText(/The import was cancelled/)
    ).toBeInTheDocument();

    const toastRoot = errorTitle.closest("li");
    expect(toastRoot).toBeTruthy();
    expect(toastRoot!.className).toContain("destructive");

    expect(screen.queryByDisplayValue("SER-UT1")).not.toBeInTheDocument();
  });
});
