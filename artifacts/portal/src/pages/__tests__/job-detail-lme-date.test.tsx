import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import JobDetailPage from "@/pages/job-detail";

vi.mock("wouter", async (importOriginal) => ({
  ...await importOriginal<typeof import("wouter")>(),
  useParams: () => ({ id: "901" }),
}));
vi.mock("@/components/sidebar-layout", () => ({
  SidebarLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

const toast = vi.fn();
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

let job: Record<string, unknown>;
let missingPrice: boolean;
let requests: string[];
let saves: Record<string, unknown>[];
let batteries: Record<string, unknown>[];
let modelSaveFails: boolean;
let modelSaveWait: Promise<void> | null;

function json(body: unknown) {
  return { ok: true, status: 200, json: async () => body } as Response;
}

function inputFor(label: string): HTMLInputElement {
  const input = screen.getAllByText(label, { exact: true }).at(-1)?.parentElement?.querySelector("input");
  if (!input) throw new Error(`No input for ${label}`);
  return input;
}

beforeEach(() => {
  requests = [];
  saves = [];
  missingPrice = false;
  batteries = [];
  modelSaveFails = false;
  modelSaveWait = null;
  toast.mockClear();
  job = {
    id: 901, reference: "LME-TEST", clientName: "Test company", depot: "Test depot",
    status: "received", submittedAt: "2026-09-18", collectionDate: null,
    proposedCollectionDate: "2026-09-20", cblDate: "2026-09-18",
    customerTractionPercent: "95", cblLmeValue: "1800", tonnage: "0",
  };
  vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push(url);
    if (url === "/api/jobs/901/admin" && init?.method === "PATCH") {
      const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
      saves.push(payload);
      Object.assign(job, payload);
      return Promise.resolve(json({ job: { ...job }, batteries: [] }));
    }
    if (url === "/api/jobs/901") return Promise.resolve(json({ job: { ...job }, batteries }));
    if (url === "/api/jobs/901/batteries/11/admin" && init?.method === "PATCH") {
      const payload = JSON.parse(String(init.body)) as Record<string, unknown>;
      saves.push(payload);
      if (modelSaveFails) return Promise.resolve({
        ok: false, status: 500, json: async () => ({ message: "Model update failed" }),
      } as Response);
      const battery = {
        ...batteries[0], ...payload, cellModelFlagReason: null,
        estimatedWeightKg: "552.720", pbContentKg: "394.800", valueGbp: "675.11",
      };
      batteries = [battery];
      const response = json({ battery, job: { ...job } });
      return modelSaveWait ? modelSaveWait.then(() => response) : Promise.resolve(response);
    }
    if (url === "/api/auth/me") return Promise.resolve(json({ user: { role: "accounts" } }));
    if (url.startsWith("/api/lme/current")) {
      const date = new URL(url, "https://example.test").searchParams.get("effectiveDate");
      const price = {
        id: 1, priceDate: date ? `${date.slice(0, 7)}-01` : "2026-10-01",
        gbpPrice: date?.startsWith("2026-09") ? "1800.00" : "2100.00",
      };
      return Promise.resolve(json({ price, effectivePrice: date && !missingPrice ? price : null }));
    }
    if (url.startsWith("/api/cell-models")) return Promise.resolve(json({ models: [{
      id: 1, manufacturer: "TAB", modelName: "5 PzS 775", cellFamily: "PzS",
      cellsCount: 5, weightPerCellKg: "32.9", pbContentKgPerCell: "32.9",
    }, {
      id: 2, manufacturer: "TAB", modelName: "3PzS375", cellFamily: "PzS",
      cellsCount: 3, weightPerCellKg: "16.2", pbContentKgPerCell: "16.2",
    }] }));
    if (url.startsWith("/api/manufacturers")) return Promise.resolve(json({ manufacturers: [], aliases: {} }));
    return Promise.resolve(json({}));
  }));
});

describe("job-page model badge saving", () => {
  beforeEach(() => {
    batteries = [{
      id: 11, jobId: 901, manufacture: "TAB", cellType: "5 EPzS 775",
      voltage: "24", batterySerial: "TEST-11", palletNumber: "P1", assetNumber: "A1",
      isLooseCells: false, looseCellsQty: null, estimatedWeightKg: "500",
      pbContentKg: "0", valueGbp: "0", receiptConfirmed: false, receiptReviewed: false,
      serialFlagReason: null, manufacturerFlagReason: null, voltageFlagReason: null,
      cellModelFlagReason: "Unrecognised value",
    }];
  });

  it("previews a typed model and voltage without saving, then sends only edited inputs", async () => {
    batteries[0] = { ...batteries[0], cellType: null, pbContentKg: null, manufacture: "Unknown" };
    render(<JobDetailPage />);
    const model = await screen.findByLabelText("Type for receipt row 1");
    fireEvent.change(model, { target: { value: "3PzS375" } });
    await waitFor(() => expect(screen.getByLabelText("Pb content for receipt row 1")).toHaveValue(194.4));
    expect(screen.getByText("Preview — save table to apply")).toBeInTheDocument();
    expect(saves).toEqual([]);
    fireEvent.change(screen.getByLabelText("Voltage for receipt row 1"), { target: { value: "48V" } });
    expect(screen.getByLabelText("Pb content for receipt row 1")).toHaveValue(388.8);
    fireEvent.click(screen.getByRole("button", { name: "Save table (1)", exact: true }));
    await waitFor(() => expect(saves).toEqual([{ cellType: "3PzS375", voltage: "48V" }]));
    await waitFor(() => expect(screen.queryByText("Preview — save table to apply")).not.toBeInTheDocument());
    expect(screen.getByLabelText("Pb content for receipt row 1")).toHaveValue(394.8);
  });

  it("preserves manual Pb and value edits across model changes and a failed save", async () => {
    render(<JobDetailPage />);
    fireEvent.change(await screen.findByLabelText("Pb content for receipt row 1"), { target: { value: "123" } });
    fireEvent.change(screen.getByLabelText("Value for receipt row 1"), { target: { value: "456" } });
    fireEvent.change(screen.getByLabelText("Type for receipt row 1"), { target: { value: "3PzS375" } });
    expect(screen.getByLabelText("Pb content for receipt row 1")).toHaveValue(123);
    expect(screen.getByLabelText("Value for receipt row 1")).toHaveValue(456);
    modelSaveFails = true;
    fireEvent.click(screen.getByRole("button", { name: "Save table (1)", exact: true }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Some rows could not be saved" })));
    expect(saves).toEqual([{ pbContentKg: "123", valueGbp: "456", cellType: "3PzS375" }]);
    expect(screen.getByLabelText("Pb content for receipt row 1")).toHaveValue(123);
    expect(screen.getByRole("button", { name: "Save table (1)", exact: true })).not.toBeDisabled();
  });

  it("sends one model-only update and refreshes both job tables with the saved response", async () => {
    render(<JobDetailPage />);
    const badge = await screen.findByRole("button", { name: /5 PzS 775.*TAB/ });
    fireEvent.click(badge);
    await waitFor(() => expect(screen.getByTitle("Edit cell model")).toHaveTextContent("5 PzS 775"));
    expect(saves).toEqual([{ cellType: "5 PzS 775" }]);
    expect(screen.getByDisplayValue("5 PzS 775")).toBeInTheDocument();
    expect(screen.getByDisplayValue("394.800")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save", exact: true })).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledWith({ title: "Saved", description: "Battery details updated." });
  });

  it("keeps the original saved model and reports a failed badge update", async () => {
    modelSaveFails = true;
    render(<JobDetailPage />);
    fireEvent.click(await screen.findByRole("button", { name: /5 PzS 775.*TAB/ }));
    await screen.findByText("Suggestion not saved. Please retry.");
    expect(screen.getByDisplayValue("5 EPzS 775")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Cell model")).toHaveValue("5 PzS 775");
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      title: "Error", description: "Model update failed",
    }));
    modelSaveFails = false;
    fireEvent.click(screen.getByRole("button", { name: /5 PzS 775.*TAB/ }));
    await waitFor(() => expect(screen.getByTitle("Edit cell model")).toHaveTextContent("5 PzS 775"));
    expect(saves).toHaveLength(2);
  });

  it("locks both tables until the model update completes and ignores repeated badge clicks", async () => {
    let finish!: () => void;
    modelSaveWait = new Promise<void>((resolve) => { finish = resolve; });
    render(<JobDetailPage />);
    const badge = await screen.findByRole("button", { name: /5 PzS 775.*TAB/ });
    fireEvent.click(badge);
    expect(badge).toBeDisabled();
    expect(screen.getByText("Saving…")).toHaveAttribute("role", "status");
    expect(screen.getByTitle("Edit notes")).toBeDisabled();
    expect(screen.getByDisplayValue("5 EPzS 775")).toBeDisabled();
    fireEvent.click(badge);
    expect(saves).toEqual([{ cellType: "5 PzS 775" }]);
    finish();
    await waitFor(() => expect(screen.getByTitle("Edit cell model")).toHaveTextContent("5 PzS 775"));
    expect(screen.getByTitle("Edit notes")).not.toBeDisabled();
    expect(screen.getByDisplayValue("5 PzS 775")).not.toBeDisabled();
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("job LME date lookup", () => {
  it("loads the CBL month price even when only a proposed collection date is shown", async () => {
    render(<JobDetailPage />);
    await waitFor(() => expect(inputFor("Collection month LME price")).toHaveValue("1800.00"));
    expect(requests).toContain("/api/lme/current?effectiveDate=2026-09-18");
    expect(requests).not.toContain("/api/lme/current?effectiveDate=2026-09-20");
    expect(screen.getByText(/based on CBL date/)).toBeInTheDocument();
    expect(inputFor("£/t Traction")).toHaveValue(1710);
    expect(saves).toHaveLength(0);
  });

  it("uses a confirmed collection date ahead of a different CBL date", async () => {
    job.collectionDate = "2026-10-02";
    render(<JobDetailPage />);
    await waitFor(() => expect(inputFor("Collection month LME price")).toHaveValue("2100.00"));
    expect(requests).toContain("/api/lme/current?effectiveDate=2026-10-02");
    expect(requests).not.toContain("/api/lme/current?effectiveDate=2026-09-18");
    expect(screen.getByText(/based on collection date/)).toBeInTheDocument();
  });

  it("refreshes the price on CBL date edits and saves the date without changing collection details", async () => {
    render(<JobDetailPage />);
    await waitFor(() => expect(inputFor("Collection month LME price")).toHaveValue("1800.00"));
    fireEvent.click(screen.getByRole("button", { name: "Edit Financial Master" }));
    fireEvent.change(inputFor("CBL Date"), { target: { value: "2026-10-06" } });
    await waitFor(() => expect(inputFor("Collection month LME price")).toHaveValue("2100.00"));
    expect(inputFor("£/t Traction")).toHaveValue(1995);
    expect(saves).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Save Financial Master" }));
    await waitFor(() => expect(saves).toHaveLength(1));
    expect(saves[0]).toMatchObject({ cblDate: "2026-10-06", customerTractionRate: "1995.00" });
    expect(saves[0]).not.toHaveProperty("collectionDate");
    await screen.findByRole("button", { name: "Edit Financial Master" });
    expect(inputFor("CBL Date")).toHaveValue("2026-10-06");
  });

  it("does not replace a missing monthly price with the latest unrelated price", async () => {
    missingPrice = true;
    render(<JobDetailPage />);
    await screen.findByText("No LME price is available for the collection / CBL month");
    expect(inputFor("Collection month LME price")).toHaveValue("");
    expect(inputFor("Collection month LME price").placeholder).toBe("Unavailable");
    expect(inputFor("£/t Traction")).toHaveValue(null);
    expect(saves).toHaveLength(0);
  });

  it("requires an actual collection or CBL date, not a proposed date alone", async () => {
    job.cblDate = null;
    render(<JobDetailPage />);
    await screen.findByText("Set a collection or CBL date to select the applicable LME price");
    expect(requests.some((url) => url.includes("effectiveDate="))).toBe(false);
    expect(inputFor("Collection month LME price")).toHaveValue("");
  });
});
