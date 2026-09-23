import { useCallback, useEffect, useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Truck,
  LogOut,
  Calendar,
  MapPin,
  Clock,
  Phone,
  AlertCircle,
  Plus,
  Pencil,
  Check,
  X,
  BookOpen,
  Settings,
  Download,
} from "lucide-react";
import itiniumLogo from "@assets/itinium-logo-transparent_1773848738567.png";
import { JobDocumentsPanel } from "@/components/job-documents";

interface CollectionJob {
  id: number;
  reference: string;
  clientName: string;
  depot: string;
  collectionPoint: string | null;
  collectionDate: string | null;
  proposedCollectionDate: string | null;
  scheduleStatus: string;
  driverName: string | null;
  vehicleReg: string | null;
  siteContacts: string | null;
  siteHours: string | null;
  specialInstructions: string | null;
  notes: string | null;
  tonnage: string;
  status: string;
  submittedAt: string;
  siteAddress: string;
}

interface FleetItem {
  id: number;
  registration?: string;
  name?: string;
  isActive: boolean;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(`${value}T00:00:00`).toLocaleDateString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

const scheduleBadge: Record<string, { label: string; className: string }> = {
  unassigned: { label: "Needs scheduling", className: "bg-amber-100 text-amber-800 border-amber-200" },
  proposed: { label: "Awaiting Itinium confirmation", className: "bg-blue-100 text-blue-800 border-blue-200" },
  confirmed: { label: "Confirmed", className: "bg-green-100 text-green-800 border-green-200" },
};

async function downloadFromApi(url: string, fallbackFilename: string) {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const error = await res.json();
      if (error?.message) message = error.message;
    } catch {}
    throw new Error(message);
  }
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = /filename="?([^";]+)"?/i.exec(disposition);
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = match ? match[1] : fallbackFilename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

export default function CollectionsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"collections" | "fleet">("collections");
  const [jobs, setJobs] = useState<CollectionJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [vehicles, setVehicles] = useState<FleetItem[]>([]);
  const [drivers, setDrivers] = useState<FleetItem[]>([]);
  const [companyName, setCompanyName] = useState("");

  const [assigningJob, setAssigningJob] = useState<CollectionJob | null>(null);
  const [assignForm, setAssignForm] = useState({ vehicleId: "", driverId: "", proposedDate: "" });
  const [assignError, setAssignError] = useState("");
  const [assignSaving, setAssignSaving] = useState(false);
  const [downloadingSheetId, setDownloadingSheetId] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<{ jobId: number; message: string } | null>(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch("/api/collection/jobs", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setJobs(data.jobs || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchFleet = useCallback(async () => {
    const res = await fetch("/api/collection-companies/fleet", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setVehicles(data.vehicles || []);
      setDrivers(data.drivers || []);
      setCompanyName(data.company?.name || "");
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    fetchFleet();
  }, [fetchJobs, fetchFleet]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    window.location.href = import.meta.env.BASE_URL;
  }

  function openAssign(job: CollectionJob) {
    setAssignError("");
    setAssignForm({
      vehicleId: "",
      driverId: "",
      proposedDate: job.proposedCollectionDate || "",
    });
    setAssigningJob(job);
  }

  async function submitAssign() {
    if (!assigningJob) return;
    if (!assignForm.vehicleId || !assignForm.driverId || !assignForm.proposedDate) {
      setAssignError("Please choose a vehicle, a driver, and a collection date.");
      return;
    }
    setAssignSaving(true);
    setAssignError("");
    try {
      const res = await fetch(`/api/collection/jobs/${assigningJob.id}/assign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          vehicleId: parseInt(assignForm.vehicleId, 10),
          driverId: parseInt(assignForm.driverId, 10),
          proposedDate: assignForm.proposedDate,
        }),
      });
      if (res.ok) {
        setAssigningJob(null);
        fetchJobs();
      } else {
        const data = await res.json().catch(() => null);
        setAssignError(data?.message || "Failed to save the schedule. Please try again.");
      }
    } catch {
      setAssignError("Failed to save the schedule. Please try again.");
    } finally {
      setAssignSaving(false);
    }
  }

  async function downloadCollectionSheet(job: CollectionJob) {
    setDownloadingSheetId(job.id);
    setDownloadError(null);
    try {
      await downloadFromApi(
        `/api/jobs/${job.id}/collection-sheet.pdf`,
        `collection-sheet-${job.reference.toLowerCase().replace(/[^a-z0-9]/g, "-")}.pdf`
      );
    } catch (error) {
      setDownloadError({
        jobId: job.id,
        message: error instanceof Error ? error.message : "Download failed. Please try again.",
      });
    } finally {
      setDownloadingSheetId(null);
    }
  }

  const activeVehicles = vehicles.filter((v) => v.isActive);
  const activeDrivers = drivers.filter((d) => d.isActive);

  return (
    <div className="min-h-screen bg-[#f8fafc]">
      <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={itiniumLogo} alt="Itinium Partnership" className="h-10" />
            <span className="hidden sm:inline text-sm text-[#64748b] ml-2">
              Collection Partner Portal{companyName ? ` — ${companyName}` : ""}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/help"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#475569] hover:text-[#0f2744] hover:bg-slate-100 rounded-md transition-colors"
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden md:inline">User Guide</span>
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#475569] hover:text-[#0f2744] hover:bg-slate-100 rounded-md transition-colors"
            >
              <Settings className="w-4 h-4" />
              <span className="hidden md:inline">Settings</span>
            </Link>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#475569] hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
              data-testid="button-logout"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">Log out</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[#0f2744]">
            Welcome{user ? `, ${user.fullName.split(" ")[0]}` : ""}
          </h1>
          <p className="text-sm text-[#64748b] mt-1">
            Assign a vehicle, driver, and collection date to each new collection. Itinium will confirm the date with the customer.
          </p>
        </div>

        <div className="flex gap-1 mb-6 border-b border-slate-200">
          {[
            { key: "collections" as const, label: "Collections" },
            { key: "fleet" as const, label: "Vehicles & Drivers" },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
                tab === t.key
                  ? "border-[#0ea5e9] text-[#0f2744]"
                  : "border-transparent text-[#64748b] hover:text-[#0f2744]"
              }`}
              data-testid={`tab-${t.key}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "collections" ? (
          loading ? (
            <p className="text-sm text-[#64748b]">Loading collections…</p>
          ) : jobs.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-10 text-center">
              <Truck className="w-10 h-10 text-slate-300 mx-auto mb-3" />
              <p className="text-[#0f2744] font-medium">No collections assigned yet</p>
              <p className="text-sm text-[#64748b] mt-1">
                You'll receive an email when a new collection needs scheduling.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {jobs.map((job) => {
                const badge = scheduleBadge[job.scheduleStatus] || scheduleBadge.unassigned;
                const internalNotes = job.notes?.trim();
                return (
                  <div key={job.id} className="bg-white rounded-xl border border-slate-200 shadow-sm p-6" data-testid={`card-collection-${job.id}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
                      <div>
                        <div className="flex items-center gap-3">
                          <h3 className="font-bold text-[#0f2744]">{job.reference}</h3>
                          <Badge variant="outline" className={`text-xs font-medium ${badge.className}`}>
                            {badge.label}
                          </Badge>
                        </div>
                        <p className="text-sm text-[#64748b] mt-1">
                          {job.clientName} — {job.depot} · {parseFloat(job.tonnage).toFixed(3)}t
                        </p>
                      </div>
                      {job.scheduleStatus !== "confirmed" ? (
                        <Button
                          size="sm"
                          className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
                          onClick={() => openAssign(job)}
                          data-testid={`button-schedule-${job.id}`}
                        >
                          <Calendar className="w-3.5 h-3.5 mr-1.5" />
                          {job.scheduleStatus === "unassigned" ? "Schedule Collection" : "Change Schedule"}
                        </Button>
                      ) : (
                        <p className="text-xs text-slate-500 max-w-[220px] text-right">
                          Schedule confirmed — contact Itinium to make changes.
                        </p>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-3 text-sm">
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-[#0ea5e9] mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase">Collection address</p>
                          <p className="text-slate-700">{job.siteAddress}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Clock className="w-4 h-4 text-[#0ea5e9] mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase">Site hours</p>
                          <p className="text-slate-700">{job.siteHours || "—"}</p>
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <Phone className="w-4 h-4 text-[#0ea5e9] mt-0.5 shrink-0" />
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase">Site contact</p>
                          <p className="text-slate-700">{job.siteContacts || "—"}</p>
                        </div>
                      </div>
                      {job.specialInstructions && (
                        <div className="flex items-start gap-2 sm:col-span-2 lg:col-span-3">
                          <AlertCircle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-slate-500 uppercase">Special instructions</p>
                            <p className="text-slate-700">{job.specialInstructions}</p>
                          </div>
                        </div>
                      )}
                      {internalNotes && (
                        <div
                          className="flex items-start gap-2 sm:col-span-2 lg:col-span-3"
                          data-testid={`internal-notes-${job.id}`}
                        >
                          <AlertCircle className="w-4 h-4 text-[#0ea5e9] mt-0.5 shrink-0" />
                          <div>
                            <p className="text-xs font-medium text-slate-500 uppercase">Internal notes</p>
                            <p className="text-slate-700 whitespace-pre-wrap break-words">{internalNotes}</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {(job.scheduleStatus === "proposed" || job.scheduleStatus === "confirmed") && (
                      <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase">
                            {job.scheduleStatus === "confirmed" ? "Confirmed date" : "Proposed date"}
                          </p>
                          <p className="font-semibold text-[#0f2744]">
                            {formatDate(job.scheduleStatus === "confirmed" ? job.collectionDate : job.proposedCollectionDate)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase">Driver</p>
                          <p className="text-slate-700">{job.driverName || "—"}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-slate-500 uppercase">Vehicle</p>
                          <p className="text-slate-700">{job.vehicleReg || "—"}</p>
                        </div>
                      </div>
                    )}

                    {job.scheduleStatus === "confirmed" && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[#0ea5e9] border-[#0ea5e9]/40 hover:bg-[#0ea5e9] hover:text-white"
                          onClick={() => downloadCollectionSheet(job)}
                          disabled={downloadingSheetId === job.id}
                          data-testid={`button-collection-sheet-${job.id}`}
                        >
                          <Download className="w-3.5 h-3.5 mr-1.5" />
                          {downloadingSheetId === job.id ? "Preparing…" : "Collection Sheet PDF"}
                        </Button>
                        {downloadError?.jobId === job.id && (
                          <p className="mt-2 text-sm text-red-600" role="alert">
                            {downloadError.message}
                          </p>
                        )}
                      </div>
                    )}

                    {(job.scheduleStatus === "confirmed" ||
                      ["received", "awaiting_invoice", "invoice", "completed"].includes(job.status)) && (
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <JobDocumentsPanel jobId={job.id} mode="upload" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <FleetPanel
              title="Vehicles"
              items={vehicles}
              valueKey="registration"
              endpoint="vehicles"
              onChanged={fetchFleet}
            />
            <FleetPanel
              title="Drivers"
              items={drivers}
              valueKey="name"
              endpoint="drivers"
              onChanged={fetchFleet}
            />
          </div>
        )}
      </main>

      <Dialog open={!!assigningJob} onOpenChange={(open) => !open && setAssigningJob(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Schedule collection {assigningJob?.reference}</DialogTitle>
            <DialogDescription>
              Choose the vehicle, driver, and proposed collection date. Itinium will confirm the date with the customer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-[#0f2744] block mb-1.5">Vehicle</label>
              <select
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={assignForm.vehicleId}
                onChange={(e) => setAssignForm({ ...assignForm, vehicleId: e.target.value })}
                data-testid="select-vehicle"
              >
                <option value="" disabled>Select a vehicle...</option>
                {activeVehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.registration}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-[#0f2744] block mb-1.5">Driver</label>
              <select
                className="w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm"
                value={assignForm.driverId}
                onChange={(e) => setAssignForm({ ...assignForm, driverId: e.target.value })}
                data-testid="select-driver"
              >
                <option value="" disabled>Select a driver...</option>
                {activeDrivers.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-[#0f2744] block mb-1.5">Collection date</label>
              <Input
                type="date"
                value={assignForm.proposedDate}
                onChange={(e) => setAssignForm({ ...assignForm, proposedDate: e.target.value })}
                data-testid="input-proposed-date"
              />
            </div>
            {assignError && <p className="text-sm text-red-600">{assignError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssigningJob(null)}>Cancel</Button>
            <Button
              className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
              onClick={submitAssign}
              disabled={assignSaving}
              data-testid="button-submit-schedule"
            >
              {assignSaving ? "Saving…" : "Propose Schedule"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FleetPanel({
  title,
  items,
  valueKey,
  endpoint,
  onChanged,
}: {
  title: string;
  items: FleetItem[];
  valueKey: "registration" | "name";
  endpoint: "vehicles" | "drivers";
  onChanged: () => void;
}) {
  const [newValue, setNewValue] = useState("");
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  const [error, setError] = useState("");

  async function addItem() {
    if (!newValue.trim()) return;
    setAdding(true);
    setError("");
    try {
      const res = await fetch(`/api/collection-companies/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ value: newValue.trim() }),
      });
      if (res.ok) {
        setNewValue("");
        onChanged();
      } else {
        setError("Could not add. Please try again.");
      }
    } finally {
      setAdding(false);
    }
  }

  async function saveEdit(id: number) {
    if (!editValue.trim()) return;
    const res = await fetch(`/api/collection-companies/${endpoint}/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ value: editValue.trim() }),
    });
    if (res.ok) {
      setEditingId(null);
      onChanged();
    }
  }

  async function toggleActive(item: FleetItem) {
    const res = await fetch(`/api/collection-companies/${endpoint}/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ isActive: !item.isActive }),
    });
    if (res.ok) onChanged();
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
      <div className="border-l-4 border-[#0ea5e9] px-5 py-3.5 bg-slate-50/50 border-b border-slate-100">
        <h3 className="font-bold text-[#0f2744]">{title}</h3>
      </div>
      <div className="p-5">
        <div className="flex gap-2 mb-4">
          <Input
            placeholder={`Add ${title.toLowerCase().replace(/s$/, "")}...`}
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem()}
            data-testid={`input-new-${endpoint}`}
          />
          <Button
            size="sm"
            className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white shrink-0 h-10"
            onClick={addItem}
            disabled={adding || !newValue.trim()}
            data-testid={`button-add-${endpoint}`}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <ul className="divide-y divide-slate-100">
          {items.map((item) => (
            <li key={item.id} className="py-2.5 flex items-center gap-2" data-testid={`row-${endpoint}-${item.id}`}>
              {editingId === item.id ? (
                <>
                  <Input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveEdit(item.id)}
                    className="h-8"
                  />
                  <button className="p-1.5 text-green-600 hover:bg-green-50 rounded" onClick={() => saveEdit(item.id)}>
                    <Check className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 text-slate-400 hover:bg-slate-100 rounded" onClick={() => setEditingId(null)}>
                    <X className="w-4 h-4" />
                  </button>
                </>
              ) : (
                <>
                  <span className={`flex-1 text-sm ${item.isActive ? "text-slate-700" : "text-slate-400 line-through"}`}>
                    {item[valueKey]}
                  </span>
                  <button
                    className="p-1.5 text-slate-400 hover:text-[#0ea5e9] hover:bg-slate-100 rounded"
                    onClick={() => {
                      setEditingId(item.id);
                      setEditValue(item[valueKey] || "");
                    }}
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    className={`text-xs px-2 py-1 rounded font-medium ${
                      item.isActive
                        ? "text-slate-500 hover:bg-slate-100"
                        : "text-green-600 hover:bg-green-50"
                    }`}
                    onClick={() => toggleActive(item)}
                  >
                    {item.isActive ? "Disable" : "Enable"}
                  </button>
                </>
              )}
            </li>
          ))}
          {items.length === 0 && <li className="py-3 text-sm text-slate-400">None yet.</li>}
        </ul>
      </div>
    </div>
  );
}
