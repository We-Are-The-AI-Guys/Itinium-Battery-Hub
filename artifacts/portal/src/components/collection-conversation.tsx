import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

type Message = { id: number; authorName: string; authorRole: string; body: string; createdAt: string };
type Change = {
  id: number; oldDriverName: string | null; newDriverName: string;
  oldVehicleReg: string | null; newVehicleReg: string; changedByName: string; changedAt: string;
};
type FleetItem = { id: number; name?: string; registration?: string; isActive: boolean };

type Props = {
  jobId: number;
  companyId?: number | null;
  scheduleStatus: string;
  jobStatus: string;
  driverName: string | null;
  vehicleReg: string | null;
  onAssignmentChanged?: () => void;
};

export function CollectionConversation({
  jobId, companyId, scheduleStatus, jobStatus, driverName, vehicleReg, onAssignmentChanged,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [changes, setChanges] = useState<Change[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);
  const [showAssignment, setShowAssignment] = useState(false);
  const [drivers, setDrivers] = useState<FleetItem[]>([]);
  const [vehicles, setVehicles] = useState<FleetItem[]>([]);
  const [driverId, setDriverId] = useState("");
  const [vehicleId, setVehicleId] = useState("");
  const [assignmentError, setAssignmentError] = useState("");
  const [assignmentSaving, setAssignmentSaving] = useState(false);
  const [fleetLoading, setFleetLoading] = useState(false);

  const base = `/api/collection/jobs/${jobId}`;
  const refresh = useCallback(async () => {
    try {
      const [messagesRes, changesRes] = await Promise.all([
        fetch(`/api/collection/jobs/${jobId}/messages`, { credentials: "include" }),
        fetch(`/api/collection/jobs/${jobId}/assignment-changes`, { credentials: "include" }),
      ]);
      if (!messagesRes.ok || !changesRes.ok) throw new Error("Could not load the conversation or assignment history");
      setMessages((await messagesRes.json()).messages);
      setChanges((await changesRes.json()).changes);
      setLoadError("");
    } catch {
      setLoadError("Could not load updates. Please retry.");
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => {
    setLoading(true);
    setMessages([]);
    setChanges([]);
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  async function sendMessage() {
    if (!message.trim() || sending) return;
    setSending(true);
    setSendError("");
    try {
      const res = await fetch(`${base}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ body: message.trim() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Could not send message");
      setMessage("");
      await refresh();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Could not send message. Please retry.");
    } finally {
      setSending(false);
    }
  }

  async function openAssignment() {
    setShowAssignment(true);
    setAssignmentError("");
    setFleetLoading(true);
    try {
      const query = companyId ? `?companyId=${companyId}` : "";
      const res = await fetch(`/api/collection-companies/fleet${query}`, { credentials: "include" });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Could not load fleet");
      const fleet = await res.json();
      const activeDrivers: FleetItem[] = (fleet.drivers || []).filter((d: FleetItem) => d.isActive);
      const activeVehicles: FleetItem[] = (fleet.vehicles || []).filter((v: FleetItem) => v.isActive);
      setDrivers(activeDrivers);
      setVehicles(activeVehicles);
      setDriverId(String(activeDrivers.find((d) => d.name === driverName)?.id || ""));
      setVehicleId(String(activeVehicles.find((v) => v.registration === vehicleReg)?.id || ""));
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "Could not load fleet");
    } finally {
      setFleetLoading(false);
    }
  }

  async function saveAssignment() {
    if (!driverId || !vehicleId) { setAssignmentError("Choose an active driver and vehicle."); return; }
    setAssignmentSaving(true);
    setAssignmentError("");
    try {
      const res = await fetch(`${base}/assignment`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify({ driverId: Number(driverId), vehicleId: Number(vehicleId) }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || "Could not change assignment");
      setShowAssignment(false);
      onAssignmentChanged?.();
      await refresh();
    } catch (error) {
      setAssignmentError(error instanceof Error ? error.message : "Could not change assignment. Please retry.");
    } finally {
      setAssignmentSaving(false);
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 mt-4" aria-label="Collection conversation">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-bold text-[#0f2744]">Collection conversation</h3>
          <p className="text-xs text-slate-500">Messages between Itinium and the collection company. Requester and internal notes stay separate.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()}>Refresh</Button>
      </div>
      {loading && <p className="text-sm text-slate-500 mt-4">Loading messages…</p>}
      {loadError && <p role="alert" className="text-sm text-red-600 mt-3">{loadError} <button type="button" className="underline" onClick={() => void refresh()}>Retry</button></p>}
      {!loading && !loadError && (
        <div className="space-y-3 mt-4 max-h-72 overflow-y-auto">
          {messages.length === 0 && <p className="text-sm text-slate-500">No messages yet.</p>}
          {messages.map((item) => (
            <div key={item.id} className="rounded-lg bg-slate-50 border border-slate-100 p-3">
              <div className="flex justify-between gap-2 text-xs text-slate-500">
                <span className="font-semibold">{item.authorName} · {item.authorRole === "collection_company" ? "Collection company" : "Itinium"}</span>
                <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("en-GB")}</time>
              </div>
              <p className="text-sm text-slate-700 whitespace-pre-wrap break-words mt-1">{item.body}</p>
            </div>
          ))}
        </div>
      )}
      <label htmlFor={`collection-message-${jobId}`} className="text-sm font-medium text-slate-700 block mt-4">Add a message</label>
      <textarea
        id={`collection-message-${jobId}`} value={message} maxLength={2000}
        onChange={(e) => setMessage(e.target.value)}
        className="w-full border border-slate-200 rounded-md p-2 text-sm mt-1 min-h-20"
        placeholder="Write an update for the other team…"
      />
      {sendError && <p role="alert" className="text-sm text-red-600">{sendError}</p>}
      <Button size="sm" onClick={sendMessage} disabled={sending || !message.trim() || !!loadError}>
        {sending ? "Sending…" : "Send message"}
      </Button>

      {scheduleStatus === "confirmed" && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap justify-between items-center gap-2">
            <h4 className="font-semibold text-sm text-[#0f2744]">Driver & vehicle changes</h4>
            {jobStatus === "confirmed" && (
              <Button variant="outline" size="sm" onClick={() => void openAssignment()}>
                Change driver or vehicle
              </Button>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">The confirmed collection date is not changed here. Download a fresh collection sheet after a change.</p>
          {showAssignment && (
            <div className="mt-3 rounded-lg border border-slate-200 p-4 space-y-3">
              {fleetLoading ? <p className="text-sm text-slate-500">Loading fleet…</p> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm">Driver
                    <select value={driverId} onChange={(e) => { setDriverId(e.target.value); setAssignmentError(""); }} className="w-full border rounded-md p-2 mt-1">
                      <option value="">Select driver</option>
                      {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm">Vehicle
                    <select value={vehicleId} onChange={(e) => { setVehicleId(e.target.value); setAssignmentError(""); }} className="w-full border rounded-md p-2 mt-1">
                      <option value="">Select vehicle</option>
                      {vehicles.map((v) => <option key={v.id} value={v.id}>{v.registration}</option>)}
                    </select>
                  </label>
                </div>
              )}
              {assignmentError && <p role="alert" className="text-sm text-red-600">{assignmentError}</p>}
              <div className="flex gap-2">
                <Button size="sm" onClick={saveAssignment} disabled={assignmentSaving || fleetLoading || !driverId || !vehicleId}>
                  {assignmentSaving ? "Saving…" : "Save assignment"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowAssignment(false)}>Cancel</Button>
              </div>
            </div>
          )}
          {changes.length > 0 && (
            <ol className="mt-3 space-y-2 text-xs text-slate-600">
              {changes.map((change) => (
                <li key={change.id} className="border-l-2 border-slate-200 pl-3">
                  {change.changedByName} · {new Date(change.changedAt).toLocaleString("en-GB")}:
                  {" "}Driver {change.oldDriverName || "—"} → {change.newDriverName};
                  {" "}vehicle {change.oldVehicleReg || "—"} → {change.newVehicleReg}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}