import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { JobDocumentsPanel } from "./job-documents";

let documents: any[];
let releasePending: boolean;
let failUpload: boolean;
beforeEach(() => {
  documents = []; releasePending = false; failUpload = false;
  vi.stubGlobal("fetch", vi.fn(async (url: string, options?: RequestInit) => {
    if (url === "https://fixture.invalid/upload") return { ok: !failUpload };
    if (url.endsWith("upload-url")) return { ok: true, json: async () => ({ uploadURL: "https://fixture.invalid/upload", objectPath: "/objects/fixture", uploadToken: "fixture-token" }) };
    if (options?.method === "POST") {
      const body = JSON.parse(String(options.body));
      documents = [...documents.filter(d => d.docType !== body.docType), { id: 1, docType: body.docType, fileName: body.name, uploadedAt: "2026-10-13" }];
      return { ok: true };
    }
    return { ok: true, json: async () => ({ documents, canUpload: true, releasePending }) };
  }));
});
describe("collector documents", () => {
  it.each(["admin", "upload"] as const)("offers all three upload/view/download/replace controls in %s mode", async mode => {
    documents = ["collection_sheet", "consignment_note", "statement"].map(docType => ({ docType, fileName: `${docType}.pdf`, uploadedAt: "2026-10-14" }));
    render(<JobDocumentsPanel jobId={5} mode={mode} />);
    await screen.findByText("All received");
    for (const type of ["collection_sheet", "consignment_note", "statement"]) {
      expect(screen.getByTestId(`button-view-${type}-5`)).toBeInTheDocument();
      expect(screen.getByTestId(`button-download-${type}-5`)).toBeInTheDocument();
      expect(screen.getByTestId(`button-upload-${type}-5`)).toHaveTextContent("Replace");
    }
  });
  it("offers Admin a Statement Upload even when no Statement exists", async () => {
    render(<JobDocumentsPanel jobId={51} mode="admin" />);
    await screen.findByText("3 outstanding");
    expect(screen.getByTestId("button-upload-statement-51")).toHaveTextContent("Upload");
  });
  it("uploads all three types and keeps assigned collector downloads available", async () => {
    const { container, unmount } = render(<JobDocumentsPanel jobId={5} mode="upload" />);
    await screen.findByText("3 outstanding");
    for (const type of ["collection_sheet", "consignment_note", "statement"]) {
      fireEvent.click(screen.getByTestId(`button-upload-${type}-5`));
      fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [new File(["fixture"], `${type}.pdf`, { type: "application/pdf" })] } });
      await screen.findByText(new RegExp(`${type}.pdf`));
      await waitFor(() => expect(screen.getByTestId(`button-upload-${type}-5`)).toBeEnabled());
    }
    expect(screen.getByText("All received")).toBeInTheDocument();
    expect(screen.getByTestId("button-download-collection_sheet-5")).toBeInTheDocument();
    unmount();
    render(<JobDocumentsPanel jobId={5} mode="upload" />);
    expect(await screen.findByText("All received")).toBeInTheDocument();
  });
  it("keeps customers free of Statement rows even if a bad response includes one", async () => {
    documents = [{ docType: "statement", fileName: "internal.pdf", uploadedAt: "2026-10-13" }];
    render(<JobDocumentsPanel jobId={5} mode="customer" />);
    await screen.findByText("Signed collection sheet");
    expect(screen.queryByText("Statement to Itinium")).not.toBeInTheDocument();
    expect(screen.queryByText(/internal.pdf/)).not.toBeInTheDocument();
    expect(screen.queryByTestId("button-upload-statement-5")).not.toBeInTheDocument();
  });
  it("reports a failed upload and allows retry", async () => {
    failUpload = true;
    const { container } = render(<JobDocumentsPanel jobId={5} mode="upload" />);
    await screen.findByText("3 outstanding");
    const choose = () => {
      fireEvent.click(screen.getByTestId("button-upload-statement-5"));
      fireEvent.change(container.querySelector("input[type=file]")!, { target: { files: [new File(["fixture"], "statement.png", { type: "image/png" })] } });
    };
    choose();
    expect(await screen.findByRole("alert")).toHaveTextContent("file upload failed");
    await waitFor(() => expect(screen.getByTestId("button-upload-statement-5")).toBeEnabled());
    failUpload = false; choose();
    expect(await screen.findByText(/statement.png/)).toBeInTheDocument();
  });
});
