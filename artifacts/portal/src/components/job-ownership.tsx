import { useEffect, useState } from "react";

export function JobOwnership({ jobId }: { jobId: number }) {
  const [clients, setClients] = useState<{ id: number; name: string }[]>([]);
  const [locations, setLocations] = useState<{ id: number; name: string; clientId: number }[]>([]);
  const [client, setClient] = useState("");
  const [location, setLocation] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    fetch("/api/clients", { credentials: "include" }).then(async res => {
      if (!res.ok) throw new Error("Could not load clients");
      setClients((await res.json()).clients);
    }).catch(error => setMessage(error.message));
  }, []);
  useEffect(() => {
    let cancelled = false;
    setLocation(""); setLocations([]);
    if (client) fetch(`/api/clients/${client}/locations`, { credentials: "include" }).then(async res => {
      if (!res.ok) throw new Error("Could not load locations");
      const data = await res.json();
      if (!cancelled) setLocations(data.locations);
    }).catch(error => { if (!cancelled) setMessage(error.message); });
    return () => { cancelled = true; };
  }, [client]);
  return <details className="rounded border p-4 bg-white">
    <summary className="cursor-pointer font-medium">Correct job access ownership (administrator only)</summary>
    <p className="my-3 text-sm">Only assign a verified client and location. Users permitted at that location will gain access. Saved collection details and historical paperwork are not rewritten.</p>
    <div className="flex flex-wrap gap-3">
      <select aria-label="Ownership client" className="border rounded p-2" value={client} onChange={e => setClient(e.target.value)}>
        <option value="">Select client</option>{clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select aria-label="Ownership location" className="border rounded p-2" value={location} onChange={e => setLocation(e.target.value)}>
        <option value="">Select location</option>{locations.filter(l => l.clientId === Number(client)).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <button disabled={!location || saving} className="border rounded p-2 disabled:opacity-40" onClick={async () => {
        if (!window.confirm("Confirm this is the verified owner of this job. This changes who can access it.")) return;
        setSaving(true); setMessage("");
        try {
          const res = await fetch(`/api/jobs/${jobId}/ownership`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ locationId: Number(location) }) });
          if (!res.ok) throw new Error((await res.json()).message);
          window.location.reload();
        } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed"); }
        finally { setSaving(false); }
      }}>{saving ? "Saving…" : "Confirm ownership"}</button>
    </div>
    {message && <p role="alert">{message}</p>}
  </details>;
}
