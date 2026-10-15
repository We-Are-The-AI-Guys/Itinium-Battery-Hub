import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { JobRequestsPanel } from "@/components/job-requests-panel";
beforeEach(() => vi.stubGlobal("fetch", vi.fn(async () => ({
  ok: true, json: async () => ({ requests: [] }),
}))));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("customer request controls", () => {
  it.each(["completed", "cancelled"])("greys out both actions and explains the cutoff at %s", async jobStatus => {
    render(<JobRequestsPanel jobId={5} variant="customer" jobStatus={jobStatus} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByTestId("button-request-amendment")).toBeDisabled();
    expect(screen.getByTestId("button-request-cancellation")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent("This job is closed");
  });
  it("keeps an amendment form open at Received but disables cancellation", async () => {
    const { rerender } = render(<JobRequestsPanel jobId={5} variant="customer" jobStatus="confirmed" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByTestId("button-request-amendment")).toBeEnabled();
    fireEvent.click(screen.getByTestId("button-request-amendment"));
    rerender(<JobRequestsPanel jobId={5} variant="customer" jobStatus="received" />);
    expect(screen.getByTestId("input-request-notes")).toBeEnabled();
    expect(screen.getByTestId("button-request-cancellation")).toBeDisabled();
  });
  it("keeps collector exception reporting enabled", async () => {
    render(<JobRequestsPanel jobId={5} variant="collector" jobStatus="received" />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.getByTestId("button-report-exception-5")).toBeEnabled();
  });
});
