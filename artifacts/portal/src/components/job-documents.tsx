import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Upload, Download, Eye, CheckCircle2, CircleDashed } from "lucide-react";

const API_BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

export const DOC_TYPES = [
  { type: "collection_sheet", label: "Signed collection sheet" },
  { type: "consignment_note", label: "Signed consignment note" },
  { type: "statement", label: "Statement to Itinium" },
] as const;

interface JobDocument {
  id: number;
  docType: string;
  fileName: string;
  contentType: string;
  sizeBytes: number | null;
  uploadedAt: string;
}

interface DocumentsState {
  documents: JobDocument[];
  canUpload: boolean;
  releasePending: boolean;
}

// Post-collection documents panel. `mode="upload"` (collection company view)
// shows upload buttons; `mode="review"` (Itinium staff) is download-only.
export function JobDocumentsPanel({
  jobId,
  mode,
  onError,
}: {
  jobId: number;
  mode: "upload" | "review" | "customer" | "admin";
  onError?: (message: string) => void;
}) {
  const [state, setState] = useState<DocumentsState | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pendingTypeRef = useRef<string | null>(null);
  const [history, setHistory] = useState<{ type: string; versions: { versionId: string; version: number; fileName: string; uploadedById: number; uploadedAt: string; replacedById?: number; replacedAt?: string }[] } | null>(null);
  async function showHistory(type: string) {
    try {
      const res = await fetch(`${API_BASE}/api/jobs/${jobId}/documents/${type}/history`, { credentials: "include" });
      if (!res.ok) throw new Error("Could not load document history.");
      const data = await res.json();
      setHistory({ type, versions: data.versions });
    } catch { fail("Could not load document history."); }
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/jobs/${jobId}/documents`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setState({ documents: data.documents || [], canUpload: !!data.canUpload, releasePending: !!data.releasePending });
        setError("");
      } else {
        setError("Could not load collection documents.");
      }
    } catch {
      setError("Could not load collection documents.");
    }
  }, [jobId]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);

  function fail(message: string) {
    setError(message);
    onError?.(message);
  }

  async function handleFileChosen(file: File) {
    const docType = pendingTypeRef.current;
    if (!docType) return;
    if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) {
      fail("Only PDF, JPG or PNG files can be uploaded.");
      pendingTypeRef.current = null;
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      fail("Files must be 20 MB or smaller.");
      pendingTypeRef.current = null;
      return;
    }
    setUploadingType(docType);
    setError("");
    try {
      const meta = { docType, name: file.name, size: file.size, contentType: file.type || "application/pdf" };
      const urlRes = await fetch(`${API_BASE}/api/collection/jobs/${jobId}/documents/upload-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(meta),
      });
      if (!urlRes.ok) {
        const data = await urlRes.json().catch(() => null);
        fail(data?.message || "Could not start the upload. Please try again.");
        return;
      }
      const { uploadURL, objectPath, uploadToken } = await urlRes.json();
      const putRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": meta.contentType },
        body: file,
      });
      if (!putRes.ok) {
        fail("The file upload failed. Please try again.");
        return;
      }
      const recordRes = await fetch(`${API_BASE}/api/collection/jobs/${jobId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ...meta, objectPath, uploadToken }),
      });
      if (!recordRes.ok) {
        const data = await recordRes.json().catch(() => null);
        fail(data?.message || "The file uploaded but could not be saved. Please try again.");
        return;
      }
      await load();
    } catch {
      fail("The file upload failed. Please try again.");
    } finally {
      setUploadingType(null);
      pendingTypeRef.current = null;
    }
  }

  async function download(docType: string, fileName: string) {
    try {
      const res = await fetch(`${API_BASE}/api/jobs/${jobId}/documents/${docType}/download`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        fail(data?.message || "Download failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      fail("Download failed.");
    }
  }

  function view(docType: string) {
    const url = `${API_BASE}/api/jobs/${jobId}/documents/${docType}/view`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  if (!state) return error ? <p role="alert">{error} <button className="underline" onClick={load}>Retry</button></p> : <p className="text-sm text-slate-500">Loading documents…</p>;
  if (mode === "review" && state.documents.length === 0 && !state.canUpload) return null;

  const visibleTypes = DOC_TYPES.filter(d => d.type !== "statement" || mode !== "customer");
  const canUploadHere = (mode === "upload" && state.canUpload) || mode === "admin";
  const outstanding = visibleTypes.filter((d) => !state.documents.some((doc) => doc.docType === d.type));

  return (
    <div data-testid={`documents-panel-${jobId}`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) handleFileChosen(file);
        }}
      />
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 uppercase flex items-center gap-1.5">
          <FileText className="w-3.5 h-3.5" /> Post-collection documents
        </p>
        {outstanding.length > 0 ? (
          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-800 border-amber-200">
            {outstanding.length} outstanding
          </Badge>
        ) : (
          <Badge variant="outline" className="text-xs bg-green-50 text-green-800 border-green-200">
            All received
          </Badge>
        )}
      </div>
      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {visibleTypes.map(({ type, label }) => {
          const doc = state.documents.find((d) => d.docType === type);
          return (
            <li key={type} className="px-3 py-2.5 flex items-center gap-3 text-sm" data-testid={`document-row-${type}-${jobId}`}>
              {doc ? (
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
              ) : (
                <CircleDashed className="w-4 h-4 text-slate-300 shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="font-medium text-[#0f2744]">{label}</p>
                {doc ? (
                  <p className="text-xs text-slate-500 truncate">
                    {doc.fileName} · {new Date(doc.uploadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                ) : (
                  <p className="text-xs text-slate-400">{state.releasePending ? "Released at Invoice" : "Not uploaded yet"}</p>
                )}
              </div>
              {doc && !state.releasePending && (
                <div className="flex items-center gap-2 shrink-0">
                  <Button
                    size="sm"
                    className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
                    onClick={() => view(type)}
                    data-testid={`button-view-${type}-${jobId}`}
                  >
                    <Eye className="w-3.5 h-3.5 mr-1.5" /> View
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => download(type, doc.fileName)}
                    data-testid={`button-download-${type}-${jobId}`}
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" /> Download
                  </Button>
                </div>
              )}
              {canUploadHere && (
                <Button
                  size="sm"
                  className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white shrink-0"
                  disabled={uploadingType !== null}
                  onClick={() => {
                    pendingTypeRef.current = type;
                    fileInputRef.current?.click();
                  }}
                  data-testid={`button-upload-${type}-${jobId}`}
                >
                  <Upload className="w-3.5 h-3.5 mr-1.5" />
                  {uploadingType === type ? "Uploading…" : doc ? "Replace" : "Upload"}
                </Button>
              )}
              {canUploadHere && <button className="text-xs text-sky-700 underline" onClick={() => showHistory(type)}>History</button>}
            </li>
          );
        })}
      </ul>
      {history && <section className="mt-3 rounded border p-3" aria-label="Document version history">
        <div className="flex justify-between"><h4 className="font-medium">Version history · {DOC_TYPES.find(d => d.type === history.type)?.label}</h4><button className="underline text-sm" onClick={() => setHistory(null)}>Close history</button></div>
        {!history.versions.length ? <p>No recorded versions.</p> : history.versions.map(version => <div key={version.versionId} className="border-t py-2 text-xs">
          <p>Version {version.version} · {version.fileName} · Uploaded by user {version.uploadedById} · {new Date(version.uploadedAt).toLocaleString("en-GB")}</p>
          {version.replacedAt && <p>Replaced by user {version.replacedById} · {new Date(version.replacedAt).toLocaleString("en-GB")}</p>}
          {["view", "download"].map(action => <a key={action} className="mr-3 text-sky-700 underline" target="_blank" rel="noopener noreferrer"
            href={`${API_BASE}/api/jobs/${jobId}/documents/${history.type}/history/${version.versionId}/${action}`}>{action === "view" ? "View" : "Download"}</a>)}
        </div>)}
      </section>}
      {mode === "upload" && !state.canUpload && (
        <p className="text-xs text-slate-400 mt-1.5">
          You can upload the signed collection sheet, consignment note and Statement to Itinium once the collection has been carried out.
        </p>
      )}
      {mode === "customer" && state.releasePending && <p className="text-xs text-slate-500 mt-2">Signed documents are released at Invoice, when Itinium invoices the collection company, and remain available afterwards.</p>}
      {error && <p role="alert" className="text-sm text-red-600 mt-2">{error} <button className="underline" onClick={load}>Refresh status</button> · Retry an upload using its Upload or Replace button.</p>}
    </div>
  );
}
