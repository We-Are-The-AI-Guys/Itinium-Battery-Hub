import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InlineFlagEdit } from "@/pages/job-detail";

afterEach(cleanup);

const props = {
  initialValue: "5 EPzS 775",
  placeholder: "Cell model",
  suggestions: [{ label: "5 PzS 775", hint: "TAB" }],
  saveSuggestionsImmediately: true,
};

describe("one-click model suggestions", () => {
  it("saves the selected model directly without opening another Save step", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<InlineFlagEdit {...props} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /5 PzS 775/ }));
    expect(onSave).toHaveBeenCalledExactlyOnceWith("5 PzS 775");
    await waitFor(() => expect(screen.queryByRole("status")).not.toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("shows saving feedback and prevents duplicate submissions", async () => {
    let finish!: (saved: boolean) => void;
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => { finish = resolve; }));
    render(<InlineFlagEdit {...props} onSave={onSave} />);
    const badge = screen.getByRole("button", { name: /5 PzS 775/ });
    fireEvent.click(badge);
    expect(screen.getByRole("status")).toHaveTextContent("Saving");
    expect(badge).toBeDisabled();
    fireEvent.click(badge);
    expect(onSave).toHaveBeenCalledTimes(1);
    await act(async () => { finish(true); });
    expect(badge).not.toBeDisabled();
  });

  it.each(["rejected", "failed"])("retains a %s suggestion for retry", async (failure) => {
    const onSave = vi.fn().mockResolvedValue(true);
    if (failure === "rejected") onSave.mockRejectedValueOnce(new Error("Network error"));
    else onSave.mockResolvedValueOnce(false);
    render(<InlineFlagEdit {...props} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /5 PzS 775/ }));
    await screen.findByRole("alert");
    expect(screen.getByPlaceholderText("Cell model")).toHaveValue("5 PzS 775");
    fireEvent.click(screen.getByRole("button", { name: /5 PzS 775/ }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(onSave).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("keeps explicitly typed models on the manual Save path", () => {
    const onSave = vi.fn();
    render(<InlineFlagEdit {...props} onSave={onSave} />);
    fireEvent.click(screen.getByTitle("Click to set cell model"));
    fireEvent.change(screen.getByPlaceholderText("Cell model"), { target: { value: "Different model" } });
    expect(onSave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("Different model");
  });

  it("also saves a badge chosen while editing a previously unflagged model", async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    render(<InlineFlagEdit {...props} subtle onSave={onSave} />);
    fireEvent.click(screen.getByTitle("Edit cell model"));
    fireEvent.click(screen.getByRole("button", { name: /5 PzS 775/ }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument());
    expect(onSave).toHaveBeenCalledExactlyOnceWith("5 PzS 775");
  });

  it("does not change the separate manufacturer suggestion workflow", () => {
    const onSave = vi.fn();
    render(<InlineFlagEdit {...props} saveSuggestionsImmediately={false} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /5 PzS 775/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("cannot save while another table mutation is running", () => {
    const onSave = vi.fn();
    render(<InlineFlagEdit {...props} disabled onSave={onSave} />);
    const badge = screen.getByRole("button", { name: /5 PzS 775/ });
    expect(badge).toBeDisabled();
    fireEvent.click(badge);
    expect(onSave).not.toHaveBeenCalled();
  });
});
