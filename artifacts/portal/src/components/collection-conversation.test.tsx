import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CollectionConversation } from "./collection-conversation";
import { COLLECTION_CONVERSATION_DESCRIPTION } from "@/lib/collection-notes-copy";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("collection conversation explanation", () => {
  it("explains its audience and dated message history without describing notes as private", async () => {
    vi.stubGlobal("fetch", vi.fn((input: RequestInfo | URL) => Promise.resolve({
      ok: true,
      json: async () => String(input).endsWith("/messages")
        ? { messages: [] }
        : { changes: [] },
    } as Response)));

    render(<CollectionConversation
      jobId={42}
      companyId={5}
      scheduleStatus="unassigned"
      jobStatus="request"
      driverName={null}
      vehicleReg={null}
    />);

    expect(screen.getByText(COLLECTION_CONVERSATION_DESCRIPTION)).toBeInTheDocument();
    expect(screen.getByText(/client requesters cannot see this conversation/)).toBeInTheDocument();
    expect(await screen.findByText("No messages yet.")).toBeInTheDocument();
    expect(screen.getByLabelText("Add a message")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
  });
});
