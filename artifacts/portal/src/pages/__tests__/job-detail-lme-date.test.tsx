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
    if (url === "/api/jobs/901") return Promise.resolve(json({ job: { ...job }, batteries: [] }));
    if (url === "/api/auth/me") return Promise.resolve(json({ user: { role: "accounts" } }));
    if (url.startsWith("/api/lme/current")) {
      const date = new URL(url, "https://example.test").searchParams.get("effectiveDate");
      const price = {
        id: 1, priceDate: date ? `${date.slice(0, 7)}-01` : "2026-10-01",
        gbpPrice: date?.startsWith("2026-09") ? "1800.00" : "2100.00",
      };
      return Promise.resolve(json({ price, effectivePrice: date && !missingPrice ? price : null }));
    }
    if (url.startsWith("/api/cell-models")) return Promise.resolve(json({ models: [] }));
    if (url.startsWith("/api/manufacturers")) return Promise.resolve(json({ manufacturers: [], aliases: {} }));
    return Promise.resolve(json({}));
  }));
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
