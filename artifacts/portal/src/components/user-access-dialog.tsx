import { useEffect, useState } from "react";
import { X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/v16-api";
import {
  CUSTOMER_ROLES, CLIENT_WIDE_ROLES, LOCATION_SCOPED_ROLES, ROLE_DESCRIPTIONS, ROLE_KEYS, ROLE_LABELS, rolesOf,
} from "@/lib/roles";

export interface AccessUser {
  id: number;
  email: string;
  fullName: string;
  role: string;
  roles?: string[];
  clientId: number | null;
  locationId: number | null;
  permittedLocationIds?: number[];
  collectionCompanyId?: number | null;
}

interface Option { id: number; name: string }

export interface AccessPayload {
  roles: string[];
  role: string;
  clientId: number | null;
  permittedLocationIds: number[];
  locationId: number | null;
  collectionCompanyId: number | null;
}

/** Pure validation used by the dialog and unit tests. Returns an error message or "". */
export function validateAccess(p: AccessPayload): string {
  if (p.roles.length === 0) return "Select at least one role.";
  const customer = p.roles.some((r) => CUSTOMER_ROLES.includes(r));
  const admin = p.roles.includes("head_office_admin");
  const collector = p.roles.includes("collection_company");
  if (customer && (admin || collector)) return "Head Office Admin and Collection Company cannot be combined with customer roles.";
  if (admin && collector) return "Head Office Admin and Collection Company cannot be combined.";
  if (customer && !p.clientId) return "Customer roles need exactly one client.";
  if (collector && !p.collectionCompanyId) return "Collection Company role needs a company.";
  const scopedOnly = customer && !p.roles.some((r) => CLIENT_WIDE_ROLES.includes(r));
  if (scopedOnly && p.locationId && !p.permittedLocationIds.includes(p.locationId)) return "Default location must be one of the permitted locations.";
  return "";
}

/** Legacy primary role: the highest-privilege role in the union. */
export function primaryRole(roles: string[]): string {
  const order = ["head_office_admin", "collection_company", "lead_client", "accounts", "team_leader", "depot_user"];
  return order.find((r) => roles.includes(r)) || roles[0] || "";
}

export function UserAccessDialog({
  user,
  clients,
  companies,
  onClose,
  onSaved,
}: {
  user: AccessUser | null; // null = create
  clients: Option[];
  companies: Option[];
  onClose: () => void;
  onSaved: (result: { tempPassword?: string | null; email?: string }) => void;
}) {
  const [fullName, setFullName] = useState(user?.fullName || "");
  const [email, setEmail] = useState(user?.email || "");
  const [roles, setRoles] = useState<string[]>(user ? rolesOf(user).filter((r) => (ROLE_KEYS as readonly string[]).includes(r)) : []);
  const [clientId, setClientId] = useState<number | null>(user?.clientId ?? null);
  const [companyId, setCompanyId] = useState<number | null>(user?.collectionCompanyId ?? null);
  const [permitted, setPermitted] = useState<number[]>(user?.permittedLocationIds ?? []);
  const [defaultLoc, setDefaultLoc] = useState<number | null>(user?.locationId ?? null);
  const [locations, setLocations] = useState<Option[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const customer = roles.some((r) => CUSTOMER_ROLES.includes(r));
  const clientWide = roles.some((r) => CLIENT_WIDE_ROLES.includes(r));
  const scoped = customer && !clientWide && roles.some((r) => LOCATION_SCOPED_ROLES.includes(r));
  const collector = roles.includes("collection_company");
  const legacyUnassigned = !!user && (rolesOf(user).length === 0 || (rolesOf(user).some((r) => CUSTOMER_ROLES.includes(r)) && !user.clientId));

  useEffect(() => {
    if (!clientId) { setLocations([]); return; }
    api<{ locations: Option[] }>(`/api/clients/${clientId}/locations`).then((d) => setLocations(d.locations || [])).catch(() => setLocations([]));
  }, [clientId]);

  function toggle(role: string) {
    setError("");
    setRoles((prev) => (prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]));
  }

  function disabledReason(role: string): string {
    if (roles.includes(role)) return "";
    const isCust = CUSTOMER_ROLES.includes(role);
    if (isCust && roles.some((r) => r === "head_office_admin" || r === "collection_company")) return "Not combinable with internal roles";
    if (!isCust && customer) return "Not combinable with customer roles";
    if (role === "head_office_admin" && collector) return "Not combinable";
    if (role === "collection_company" && roles.includes("head_office_admin")) return "Not combinable";
    return "";
  }

  async function save() {
    const payload: AccessPayload = {
      roles,
      role: primaryRole(roles),
      clientId: customer ? clientId : null,
      permittedLocationIds: scoped ? permitted : clientWide ? locations.map((l) => l.id) : [],
      locationId: customer ? defaultLoc : null,
      collectionCompanyId: collector ? companyId : null,
    };
    if (!user && (!fullName.trim() || !email.trim())) { setError("Name and email are required."); return; }
    const v = validateAccess(payload);
    if (v) { setError(v); return; }
    setSaving(true);
    setError("");
    try {
      if (user) {
        await api(`/api/users/${user.id}`, { method: "PATCH", json: { fullName: fullName.trim(), ...payload } });
        onSaved({});
      } else {
        const d = await api<{ tempPassword?: string; user: { email: string } }>("/api/users", { method: "POST", json: { fullName: fullName.trim(), email: email.trim(), ...payload } });
        onSaved({ tempPassword: d.tempPassword ?? null, email: d.user.email });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save user.");
    } finally {
      setSaving(false);
    }
  }

  const locChoices = scoped ? locations.filter((l) => permitted.includes(l.id)) : locations;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-[600px] max-h-[92vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2"><ShieldCheck className="w-5 h-5 text-[#0ea5e9]" />{user ? "Edit access" : "Add new user"}</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 text-slate-400 hover:text-slate-600 rounded-md"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-6 space-y-5">
          {legacyUnassigned && (
            <p role="alert" className="text-sm rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
              This account is restricted: it has no client or recognised role assigned yet, so it cannot see any data. Assign roles and a client below. Nothing is granted automatically.
            </p>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">Full name</span><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></label>
            <label className="block"><span className="block text-sm font-medium text-slate-700 mb-1">Email</span><Input type="email" value={email} disabled={!!user} onChange={(e) => setEmail(e.target.value)} /></label>
          </div>

          <fieldset>
            <legend className="text-sm font-medium text-slate-700 mb-2">Roles</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ROLE_KEYS.map((r) => {
                const reason = disabledReason(r);
                const checked = roles.includes(r);
                return (
                  <label key={r} className={`flex gap-2.5 rounded-lg border p-3 cursor-pointer transition-colors ${checked ? "border-[#0ea5e9] bg-sky-50/60" : "border-slate-200 hover:border-slate-300"} ${reason ? "opacity-50 cursor-not-allowed" : ""}`}>
                    <input type="checkbox" className="mt-0.5 accent-[#0ea5e9]" checked={checked} disabled={!!reason} onChange={() => toggle(r)} data-testid={`checkbox-role-${r}`} />
                    <span>
                      <span className="block text-sm font-semibold text-[#0f2744]">{ROLE_LABELS[r]}</span>
                      <span className="block text-xs text-slate-500">{reason || ROLE_DESCRIPTIONS[r]}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {customer && (
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 mb-1">Client <span className="text-red-500">*</span></span>
              <select value={clientId ?? ""} onChange={(e) => { setClientId(e.target.value ? Number(e.target.value) : null); setPermitted([]); setDefaultLoc(null); }} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white" data-testid="select-access-client">
                <option value="">Select a client…</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}

          {collector && (
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 mb-1">Collection company <span className="text-red-500">*</span></span>
              <select value={companyId ?? ""} onChange={(e) => setCompanyId(e.target.value ? Number(e.target.value) : null)} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white">
                <option value="">Select a company…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
          )}

          {customer && clientId && (
            <div className="space-y-3">
              {clientWide ? (
                <p className="text-sm rounded-md bg-slate-50 border border-slate-200 p-3 text-slate-600">Lead Client and Accounts automatically have every location for this client ({locations.length}).</p>
              ) : (
                <fieldset>
                  <legend className="text-sm font-medium text-slate-700 mb-2">Permitted locations</legend>
                  {locations.length === 0 ? <p className="text-xs text-slate-500">This client has no locations yet.</p> : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto rounded-md border border-slate-200 p-2">
                      {locations.map((l) => (
                        <label key={l.id} className="flex items-center gap-2 text-sm px-1.5 py-1 rounded hover:bg-slate-50">
                          <input type="checkbox" className="accent-[#0ea5e9]" checked={permitted.includes(l.id)} onChange={() => {
                            setPermitted((p) => (p.includes(l.id) ? p.filter((x) => x !== l.id) : [...p, l.id]));
                            if (defaultLoc === l.id) setDefaultLoc(null);
                          }} />
                          {l.name}
                        </label>
                      ))}
                    </div>
                  )}
                  {permitted.length === 0 && <p className="text-xs text-amber-700 mt-1">No locations selected: this user will see no depot data.</p>}
                </fieldset>
              )}
              <label className="block">
                <span className="block text-sm font-medium text-slate-700 mb-1">Default location <span className="text-slate-400 font-normal">(optional, preselected on new collections)</span></span>
                <select value={defaultLoc ?? ""} onChange={(e) => setDefaultLoc(e.target.value ? Number(e.target.value) : null)} className="w-full text-sm border border-slate-200 rounded-md px-3 py-2 bg-white">
                  <option value="">No default</option>
                  {locChoices.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                </select>
              </label>
            </div>
          )}

          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        </div>
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-2 sticky bottom-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={save} className="bg-[#0f2744] hover:bg-[#1e3a5f] text-white" data-testid="button-save-access">{saving ? "Saving…" : user ? "Save access" : "Create user"}</Button>
        </div>
      </div>
    </div>
  );
}
