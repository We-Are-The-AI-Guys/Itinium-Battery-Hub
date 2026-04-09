import { useEffect, useState, useCallback } from "react";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Building2,
  MapPin,
  Users,
  Plus,
  Edit,
  X,
  Search,
  ChevronDown,
  ChevronRight,
  Mail,
  User,
} from "lucide-react";

interface ClientData {
  id: number;
  name: string;
  contactName: string | null;
  contactEmail: string | null;
  isActive: boolean;
  createdAt: string;
  locationCount: number;
  userCount: number;
}

interface LocationData {
  id: number;
  clientId: number;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
}

interface TeamLeader {
  id: number;
  fullName: string;
  email: string;
}

export default function ClientManagementPage() {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedClient, setExpandedClient] = useState<number | null>(null);
  const [clientLocations, setClientLocations] = useState<Record<number, LocationData[]>>({});
  const [clientTeamLeaders, setClientTeamLeaders] = useState<Record<number, TeamLeader[]>>({});

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", contactName: "", contactEmail: "" });
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingClient, setEditingClient] = useState<ClientData | null>(null);
  const [editForm, setEditForm] = useState({ name: "", contactName: "", contactEmail: "" });
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  const [showAddLocation, setShowAddLocation] = useState<number | null>(null);
  const [newLocationForm, setNewLocationForm] = useState({ name: "", address: "" });
  const [addingLocation, setAddingLocation] = useState(false);
  const [locationError, setLocationError] = useState("");

  const fetchClients = useCallback(async () => {
    try {
      const params = new URLSearchParams({ includeInactive: "true" });
      if (searchQuery) params.set("search", searchQuery);
      const res = await fetch(`/api/clients?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients);
      }
    } catch {}
  }, [searchQuery]);

  useEffect(() => { fetchClients(); }, [fetchClients]);

  async function fetchClientDetails(clientId: number) {
    try {
      const res = await fetch(`/api/clients/${clientId}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setClientLocations((prev) => ({ ...prev, [clientId]: data.locations }));
        setClientTeamLeaders((prev) => ({ ...prev, [clientId]: data.teamLeaders }));
      }
    } catch {}
  }

  function toggleExpand(clientId: number) {
    if (expandedClient === clientId) {
      setExpandedClient(null);
    } else {
      setExpandedClient(clientId);
      if (!clientLocations[clientId]) {
        fetchClientDetails(clientId);
      }
    }
  }

  async function handleCreateClient() {
    setCreateError("");
    if (!createForm.name.trim()) {
      setCreateError("Client name is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: createForm.name.trim(),
          contactName: createForm.contactName.trim() || null,
          contactEmail: createForm.contactEmail.trim() || null,
        }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setCreateForm({ name: "", contactName: "", contactEmail: "" });
        fetchClients();
      } else {
        const data = await res.json();
        setCreateError(data.message || "Failed to create client");
      }
    } catch {
      setCreateError("Failed to create client");
    } finally {
      setCreating(false);
    }
  }

  function openEditModal(client: ClientData) {
    setEditingClient(client);
    setEditForm({
      name: client.name,
      contactName: client.contactName || "",
      contactEmail: client.contactEmail || "",
    });
    setEditError("");
  }

  async function handleEditClient() {
    if (!editingClient) return;
    setEditError("");
    if (!editForm.name.trim()) {
      setEditError("Client name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${editingClient.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editForm.name.trim(),
          contactName: editForm.contactName.trim() || null,
          contactEmail: editForm.contactEmail.trim() || null,
        }),
      });
      if (res.ok) {
        setEditingClient(null);
        fetchClients();
      } else {
        const data = await res.json();
        setEditError(data.message || "Failed to update client");
      }
    } catch {
      setEditError("Failed to update client");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleClientActive(client: ClientData) {
    try {
      await fetch(`/api/clients/${client.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: !client.isActive }),
      });
      fetchClients();
    } catch {}
  }

  async function handleAddLocation(clientId: number) {
    setLocationError("");
    if (!newLocationForm.name.trim()) {
      setLocationError("Location name is required");
      return;
    }
    setAddingLocation(true);
    try {
      const res = await fetch(`/api/clients/${clientId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: newLocationForm.name.trim(),
          address: newLocationForm.address.trim() || null,
        }),
      });
      if (res.ok) {
        setShowAddLocation(null);
        setNewLocationForm({ name: "", address: "" });
        fetchClientDetails(clientId);
        fetchClients();
      } else {
        const data = await res.json();
        setLocationError(data.message || "Failed to add location");
      }
    } catch {
      setLocationError("Failed to add location");
    } finally {
      setAddingLocation(false);
    }
  }

  async function handleToggleLocationActive(clientId: number, locationId: number, currentActive: boolean) {
    try {
      await fetch(`/api/clients/${clientId}/locations/${locationId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: !currentActive }),
      });
      fetchClientDetails(clientId);
    } catch {}
  }

  return (
    <SidebarLayout
      title="Client Management"
      subtitle="Manage clients, locations, and team leaders"
    >
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-[#0f2744] p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Total Clients</p>
                <h3 className="text-3xl font-bold text-[#0f2744]">{clients.length}</h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-slate-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-teal-500 p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Total Locations</p>
                <h3 className="text-3xl font-bold text-[#0f2744]">
                  {clients.reduce((sum, c) => sum + c.locationCount, 0)}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-teal-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-indigo-500 p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Total Users</p>
                <h3 className="text-3xl font-bold text-[#0f2744]">
                  {clients.reduce((sum, c) => sum + c.userCount, 0)}
                </h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-indigo-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-[#0f2744]">All Clients</h3>
            <div className="flex items-center gap-4">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9 text-sm bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
                />
              </div>
              <Button
                className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm"
                onClick={() => { setShowCreateModal(true); setCreateError(""); }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Client
              </Button>
            </div>
          </div>

          <div className="divide-y divide-slate-100">
            {clients.map((client) => (
              <div key={client.id}>
                <div
                  className="px-6 py-4 flex items-center gap-4 hover:bg-slate-50/80 transition-colors cursor-pointer"
                  onClick={() => toggleExpand(client.id)}
                >
                  <ChevronRight
                    className={`w-4 h-4 text-slate-400 transition-transform ${expandedClient === client.id ? "rotate-90" : ""}`}
                  />
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#0f2744] to-[#1e3a5f] flex items-center justify-center text-white font-bold text-sm">
                    {client.name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[#0f2744]">{client.name}</div>
                    <div className="text-xs text-slate-500">
                      {client.contactName && <span>{client.contactName}</span>}
                      {client.contactName && client.contactEmail && <span> &middot; </span>}
                      {client.contactEmail && <span>{client.contactEmail}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      {client.locationCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3.5 h-3.5" />
                      {client.userCount}
                    </span>
                    <Badge
                      variant="outline"
                      className={client.isActive
                        ? "bg-green-50 text-green-700 border-green-200"
                        : "bg-slate-100 text-slate-500 border-slate-200"
                      }
                    >
                      {client.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2.5 text-slate-600 border-slate-200 hover:bg-slate-100"
                      onClick={() => openEditModal(client)}
                    >
                      <Edit className="w-3.5 h-3.5 mr-1" />
                      Edit
                    </Button>
                    <button
                      className={`text-xs font-medium hover:underline ${client.isActive ? "text-red-600" : "text-green-600"}`}
                      onClick={() => handleToggleClientActive(client)}
                    >
                      {client.isActive ? "Deactivate" : "Activate"}
                    </button>
                  </div>
                </div>

                {expandedClient === client.id && (
                  <div className="bg-slate-50/50 border-t border-slate-100 px-6 py-4">
                    <div className="ml-14 space-y-4">
                      {clientTeamLeaders[client.id]?.length > 0 && (
                        <div>
                          <h4 className="text-xs font-semibold uppercase text-slate-500 mb-2">Team Leaders</h4>
                          <div className="flex flex-wrap gap-2">
                            {clientTeamLeaders[client.id].map((tl) => (
                              <div key={tl.id} className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-1.5 text-sm">
                                <User className="w-3.5 h-3.5 text-teal-600" />
                                <span className="font-medium text-slate-700">{tl.fullName}</span>
                                <span className="text-slate-400">{tl.email}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-xs font-semibold uppercase text-slate-500">Locations</h4>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs border-slate-200"
                            onClick={() => {
                              setShowAddLocation(showAddLocation === client.id ? null : client.id);
                              setNewLocationForm({ name: "", address: "" });
                              setLocationError("");
                            }}
                          >
                            <Plus className="w-3 h-3 mr-1" />
                            Add Location
                          </Button>
                        </div>

                        {showAddLocation === client.id && (
                          <div className="bg-white rounded-lg border border-slate-200 p-4 mb-3 space-y-3">
                            {locationError && (
                              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-2">
                                {locationError}
                              </div>
                            )}
                            <div className="grid grid-cols-2 gap-3">
                              <Input
                                placeholder="Location name"
                                className="border-slate-200 focus-visible:ring-[#0ea5e9] h-8 text-sm"
                                value={newLocationForm.name}
                                onChange={(e) => setNewLocationForm({ ...newLocationForm, name: e.target.value })}
                              />
                              <Input
                                placeholder="Address (optional)"
                                className="border-slate-200 focus-visible:ring-[#0ea5e9] h-8 text-sm"
                                value={newLocationForm.address}
                                onChange={(e) => setNewLocationForm({ ...newLocationForm, address: e.target.value })}
                              />
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setShowAddLocation(null)}>Cancel</Button>
                              <Button
                                size="sm"
                                className="h-7 text-xs bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
                                onClick={() => handleAddLocation(client.id)}
                                disabled={addingLocation}
                              >
                                {addingLocation ? "Adding..." : "Add"}
                              </Button>
                            </div>
                          </div>
                        )}

                        {clientLocations[client.id]?.length > 0 ? (
                          <div className="space-y-1">
                            {clientLocations[client.id].map((loc) => (
                              <div
                                key={loc.id}
                                className="flex items-center justify-between bg-white rounded-lg border border-slate-200 px-4 py-2.5 text-sm"
                              >
                                <div className="flex items-center gap-3">
                                  <MapPin className="w-4 h-4 text-slate-400" />
                                  <div>
                                    <span className="font-medium text-slate-700">{loc.name}</span>
                                    {loc.address && (
                                      <p className="text-xs text-slate-400 mt-0.5">{loc.address}</p>
                                    )}
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className={`text-xs ${loc.isActive ? "bg-green-50 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"}`}
                                  >
                                    {loc.isActive ? "Active" : "Inactive"}
                                  </Badge>
                                  <button
                                    className={`text-xs font-medium hover:underline ${loc.isActive ? "text-red-600" : "text-green-600"}`}
                                    onClick={() => handleToggleLocationActive(client.id, loc.id, loc.isActive)}
                                  >
                                    {loc.isActive ? "Deactivate" : "Activate"}
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-400">No locations yet</p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {clients.length === 0 && (
              <div className="px-6 py-12 text-center text-slate-500">
                No clients found
              </div>
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[500px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#0ea5e9]" />
                Add New Client
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {createError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{createError}</div>
              )}
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700">Client Name *</label>
                <Input
                  placeholder="e.g. Greenfield Logistics"
                  className="border-slate-200 focus-visible:ring-[#0ea5e9]"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700">Contact Name</label>
                <Input
                  placeholder="e.g. Alex Johnson"
                  className="border-slate-200 focus-visible:ring-[#0ea5e9]"
                  value={createForm.contactName}
                  onChange={(e) => setCreateForm({ ...createForm, contactName: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700">Contact Email</label>
                <Input
                  type="email"
                  placeholder="e.g. alex@greenfield.co.uk"
                  className="border-slate-200 focus-visible:ring-[#0ea5e9]"
                  value={createForm.contactEmail}
                  onChange={(e) => setCreateForm({ ...createForm, contactEmail: e.target.value })}
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCreateModal(false)} className="border-slate-200 text-slate-700 hover:bg-slate-100">Cancel</Button>
              <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm" onClick={handleCreateClient} disabled={creating}>
                {creating ? "Creating..." : "Create Client"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingClient && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[500px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
                <Edit className="w-5 h-5 text-[#0ea5e9]" />
                Edit Client
              </h3>
              <button onClick={() => setEditingClient(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {editError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{editError}</div>
              )}
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700">Client Name *</label>
                <Input
                  className="border-slate-200 focus-visible:ring-[#0ea5e9]"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700">Contact Name</label>
                <Input
                  className="border-slate-200 focus-visible:ring-[#0ea5e9]"
                  value={editForm.contactName}
                  onChange={(e) => setEditForm({ ...editForm, contactName: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700">Contact Email</label>
                <Input
                  type="email"
                  className="border-slate-200 focus-visible:ring-[#0ea5e9]"
                  value={editForm.contactEmail}
                  onChange={(e) => setEditForm({ ...editForm, contactEmail: e.target.value })}
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setEditingClient(null)} className="border-slate-200 text-slate-700 hover:bg-slate-100">Cancel</Button>
              <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm" onClick={handleEditClient} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
