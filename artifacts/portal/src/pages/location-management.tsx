import { useEffect, useState, useCallback } from "react";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  MapPin,
  Plus,
  Edit,
  X,
} from "lucide-react";

interface LocationData {
  id: number;
  clientId: number;
  name: string;
  address: string | null;
  isActive: boolean;
  createdAt: string;
}

interface UserInfo {
  clientId: number | null;
  clientName: string | null;
}

export default function LocationManagementPage() {
  const [locations, setLocations] = useState<LocationData[]>([]);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", address: "" });
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);

  const [editingLocation, setEditingLocation] = useState<LocationData | null>(null);
  const [editForm, setEditForm] = useState({ name: "", address: "" });
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUserInfo({ clientId: data.user.clientId, clientName: data.user.clientName });
        }
      })
      .catch(() => {});
  }, []);

  const fetchLocations = useCallback(async () => {
    if (!userInfo?.clientId) return;
    try {
      const res = await fetch(`/api/clients/${userInfo.clientId}/locations`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setLocations(data.locations);
      }
    } catch {}
  }, [userInfo?.clientId]);

  useEffect(() => { fetchLocations(); }, [fetchLocations]);

  async function handleCreateLocation() {
    if (!userInfo?.clientId) return;
    setCreateError("");
    if (!createForm.name.trim()) {
      setCreateError("Location name is required");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch(`/api/clients/${userInfo.clientId}/locations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: createForm.name.trim(),
          address: createForm.address.trim() || null,
        }),
      });
      if (res.ok) {
        setShowCreateModal(false);
        setCreateForm({ name: "", address: "" });
        fetchLocations();
      } else {
        const data = await res.json();
        setCreateError(data.message || "Failed to create location");
      }
    } catch {
      setCreateError("Failed to create location");
    } finally {
      setCreating(false);
    }
  }

  function openEditModal(loc: LocationData) {
    setEditingLocation(loc);
    setEditForm({ name: loc.name, address: loc.address || "" });
    setEditError("");
  }

  async function handleEditLocation() {
    if (!editingLocation || !userInfo?.clientId) return;
    setEditError("");
    if (!editForm.name.trim()) {
      setEditError("Location name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/clients/${userInfo.clientId}/locations/${editingLocation.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: editForm.name.trim(),
          address: editForm.address.trim() || null,
        }),
      });
      if (res.ok) {
        setEditingLocation(null);
        fetchLocations();
      } else {
        const data = await res.json();
        setEditError(data.message || "Failed to update location");
      }
    } catch {
      setEditError("Failed to update location");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(loc: LocationData) {
    if (!userInfo?.clientId) return;
    try {
      await fetch(`/api/clients/${userInfo.clientId}/locations/${loc.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: !loc.isActive }),
      });
      fetchLocations();
    } catch {}
  }

  return (
    <SidebarLayout
      title="Locations"
      subtitle={userInfo?.clientName ? `Manage locations for ${userInfo.clientName}` : "Manage your client locations"}
    >
      <div className="space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-teal-500 p-5 max-w-xs">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-sm font-medium text-slate-500 mb-1">Total Locations</p>
              <h3 className="text-3xl font-bold text-[#0f2744]">{locations.length}</h3>
            </div>
            <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
              <MapPin className="w-5 h-5 text-teal-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-lg font-bold text-[#0f2744]">All Locations</h3>
            <Button
              className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm"
              onClick={() => { setShowCreateModal(true); setCreateError(""); }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Location
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">Location</th>
                  <th className="px-6 py-4 font-semibold">Address</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {locations.map((loc, index) => (
                  <tr
                    key={loc.id}
                    className={`hover:bg-slate-50/80 transition-colors ${index % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <MapPin className="w-4 h-4 text-teal-500" />
                        <span className="font-medium text-[#0f2744]">{loc.name}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-slate-500">{loc.address || "-"}</td>
                    <td className="px-6 py-4">
                      <Badge
                        variant="outline"
                        className={loc.isActive
                          ? "bg-green-50 text-green-700 border-green-200"
                          : "bg-slate-100 text-slate-500 border-slate-200"
                        }
                      >
                        {loc.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 px-2.5 text-slate-600 border-slate-200 hover:bg-slate-100"
                          onClick={() => openEditModal(loc)}
                        >
                          <Edit className="w-3.5 h-3.5 mr-1" />
                          Edit
                        </Button>
                        <button
                          className={`text-xs font-medium hover:underline ${loc.isActive ? "text-red-600" : "text-green-600"}`}
                          onClick={() => handleToggleActive(loc)}
                        >
                          {loc.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {locations.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-6 py-12 text-center text-slate-500">
                      No locations found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[500px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
                <MapPin className="w-5 h-5 text-[#0ea5e9]" />
                Add New Location
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
                <label className="text-sm font-medium text-slate-700">Location Name *</label>
                <Input
                  placeholder="e.g. Birmingham Central"
                  className="border-slate-200 focus-visible:ring-[#0ea5e9]"
                  value={createForm.name}
                  onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700">Address</label>
                <Input
                  placeholder="e.g. Unit 5, Aston Industrial Park, B6 7EY"
                  className="border-slate-200 focus-visible:ring-[#0ea5e9]"
                  value={createForm.address}
                  onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setShowCreateModal(false)} className="border-slate-200 text-slate-700 hover:bg-slate-100">Cancel</Button>
              <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm" onClick={handleCreateLocation} disabled={creating}>
                {creating ? "Creating..." : "Create Location"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {editingLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[500px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
                <Edit className="w-5 h-5 text-[#0ea5e9]" />
                Edit Location
              </h3>
              <button onClick={() => setEditingLocation(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {editError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{editError}</div>
              )}
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700">Location Name *</label>
                <Input
                  className="border-slate-200 focus-visible:ring-[#0ea5e9]"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <label className="text-sm font-medium text-slate-700">Address</label>
                <Input
                  className="border-slate-200 focus-visible:ring-[#0ea5e9]"
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setEditingLocation(null)} className="border-slate-200 text-slate-700 hover:bg-slate-100">Cancel</Button>
              <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm" onClick={handleEditLocation} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
