import { useEffect, useState, useCallback } from "react";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  User,
  Bell,
  ShieldCheck,
  Settings,
  Save,
  Lock,
  Monitor,
  Trash2,
  Building2,
  FileText,
  Database,
  TrendingUp,
  Eye,
  EyeOff,
  Weight,
  Plus,
  Pencil,
  X,
} from "lucide-react";

interface UserProfile {
  id: number;
  email: string;
  fullName: string;
  role: string;
  depot: string | null;
  createdAt?: string;
}

interface NotificationPrefs {
  newJobSubmitted: boolean;
  jobApprovedCompleted: boolean;
  invoiceGenerated: boolean;
  lmePriceAlerts: boolean;
  weeklySummary: boolean;
}

interface SessionData {
  id: number;
  browser: string;
  ipAddress: string;
  lastUsedAt: string;
  createdAt: string;
  expiresAt: string;
  isCurrent: boolean;
}

interface SystemSettings {
  id: number;
  companyName: string;
  invoicePrefix: string;
  dataRetentionDays: number;
  autoFetchLme: boolean;
  updatedAt: string;
}

const TABS = [
  { id: "profile", label: "Profile", icon: User },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "weights", label: "Battery Weights", icon: Weight },
  { id: "collection-points", label: "Collection Points", icon: Building2 },
  { id: "system", label: "System", icon: Settings },
] as const;

type TabId = (typeof TABS)[number]["id"];

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    depot_user: "Depot User",
    team_leader: "Team Leader",
    accounts: "Accounts",
    head_office_admin: "Head Office Admin",
  };
  return labels[role] || role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ProfileTab({ user, onProfileUpdated }: { user: UserProfile; onProfileUpdated: () => void }) {
  const { toast } = useToast();
  const [fullName, setFullName] = useState(user.fullName);
  const [depot, setDepot] = useState(user.depot || "");
  const [saving, setSaving] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  async function handleSaveProfile() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fullName, depot: depot || null }),
      });
      if (res.ok) {
        toast({ title: "Profile updated", description: "Your profile has been saved successfully." });
        onProfileUpdated();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to update profile", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update profile", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      toast({ title: "Error", description: "New passwords do not match", variant: "destructive" });
      return;
    }
    if (newPassword.length < 6) {
      toast({ title: "Error", description: "New password must be at least 6 characters", variant: "destructive" });
      return;
    }
    setChangingPassword(true);
    try {
      const res = await fetch("/api/settings/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      if (res.ok) {
        toast({ title: "Password changed", description: "Your password has been updated successfully." });
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to change password", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to change password", variant: "destructive" });
    } finally {
      setChangingPassword(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
            <User className="w-5 h-5 text-[#0ea5e9]" />
            Personal Information
          </h3>
          <p className="text-sm text-slate-500 mt-1">Update your name and assigned depot</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">Full Name</label>
            <Input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="border-slate-200 focus-visible:ring-[#0ea5e9] max-w-md"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">Email Address</label>
            <Input
              value={user.email}
              disabled
              className="border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed max-w-md"
            />
            <p className="text-xs text-slate-400">Email cannot be changed. Contact an administrator.</p>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">Role</label>
            <Input
              value={getRoleLabel(user.role)}
              disabled
              className="border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed max-w-md"
            />
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">Assigned Depot</label>
            <Input
              value={depot}
              onChange={(e) => setDepot(e.target.value)}
              placeholder="e.g. Birmingham Central"
              className="border-slate-200 focus-visible:ring-[#0ea5e9] max-w-md"
            />
          </div>
          <div className="pt-2">
            <Button
              className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm"
              onClick={handleSaveProfile}
              disabled={saving}
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? "Saving..." : "Save Profile"}
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
            <Lock className="w-5 h-5 text-[#0ea5e9]" />
            Change Password
          </h3>
          <p className="text-sm text-slate-500 mt-1">Update your account password</p>
        </div>
        <div className="p-6 space-y-5">
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">Current Password</label>
            <div className="relative max-w-md">
              <Input
                type={showCurrent ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="border-slate-200 focus-visible:ring-[#0ea5e9] pr-10"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">New Password</label>
            <div className="relative max-w-md">
              <Input
                type={showNew ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="border-slate-200 focus-visible:ring-[#0ea5e9] pr-10"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div className="grid gap-2">
            <label className="text-sm font-medium text-slate-700">Confirm New Password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="border-slate-200 focus-visible:ring-[#0ea5e9] max-w-md"
            />
          </div>
          <div className="pt-2">
            <Button
              variant="outline"
              className="border-slate-200 text-[#0f2744] hover:bg-slate-100"
              onClick={handleChangePassword}
              disabled={changingPassword || !currentPassword || !newPassword}
            >
              <Lock className="w-4 h-4 mr-2" />
              {changingPassword ? "Changing..." : "Change Password"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const { toast } = useToast();
  const [prefs, setPrefs] = useState<NotificationPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings/notifications", { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => { if (data?.preferences) setPrefs(data.preferences); })
      .catch(() => {});
  }, []);

  async function handleSave() {
    if (!prefs) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(prefs),
      });
      if (res.ok) {
        toast({ title: "Preferences saved", description: "Your notification preferences have been updated." });
      } else {
        toast({ title: "Error", description: "Failed to save preferences", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to save preferences", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const notifications = [
    { key: "newJobSubmitted" as const, label: "New Job Submitted", description: "Receive alerts when a new battery collection job is submitted", icon: FileText },
    { key: "jobApprovedCompleted" as const, label: "Job Approved / Completed", description: "Get notified when jobs are approved or marked as completed", icon: ShieldCheck },
    { key: "invoiceGenerated" as const, label: "Invoice Generated", description: "Receive an email when a new invoice is generated", icon: FileText },
    { key: "lmePriceAlerts" as const, label: "LME Price Alerts", description: "Get alerts when LME lead prices change significantly", icon: TrendingUp },
    { key: "weeklySummary" as const, label: "Weekly Summary Report", description: "Receive a weekly email summarizing jobs, tonnage, and revenue", icon: Bell },
  ];

  if (!prefs) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
        Loading preferences...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
          <Bell className="w-5 h-5 text-[#0ea5e9]" />
          Email Notifications
        </h3>
        <p className="text-sm text-slate-500 mt-1">Choose which email notifications you would like to receive</p>
      </div>
      <div className="divide-y divide-slate-100">
        {notifications.map((n) => (
          <div key={n.key} className="px-6 py-5 flex items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0 mt-0.5">
                <n.icon className="w-5 h-5 text-slate-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-[#0f2744]">{n.label}</p>
                <p className="text-sm text-slate-500 mt-0.5">{n.description}</p>
              </div>
            </div>
            <Switch
              checked={prefs[n.key]}
              onCheckedChange={(checked) => setPrefs({ ...prefs, [n.key]: checked })}
              className="data-[state=checked]:bg-[#0ea5e9]"
            />
          </div>
        ))}
      </div>
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
        <Button
          className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm"
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save Preferences"}
        </Button>
      </div>
    </div>
  );
}

function SecurityTab({ user }: { user: UserProfile }) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<number | "all" | null>(null);

  const fetchSessions = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/sessions", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setSessions(data.sessions);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  async function handleRevokeSession(id: number) {
    setRevoking(id);
    try {
      const res = await fetch(`/api/settings/sessions/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Session revoked", description: "The session has been terminated." });
        fetchSessions();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to revoke session", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to revoke session", variant: "destructive" });
    } finally {
      setRevoking(null);
    }
  }

  async function handleRevokeAll() {
    setRevoking("all");
    try {
      const res = await fetch("/api/settings/sessions", {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Sessions revoked", description: "All other sessions have been terminated." });
        fetchSessions();
      } else {
        toast({ title: "Error", description: "Failed to revoke sessions", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to revoke sessions", variant: "destructive" });
    } finally {
      setRevoking(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-[#0ea5e9]" />
            Account Information
          </h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</p>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500"></span>
                <span className="text-sm font-medium text-slate-700">Active</span>
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Role</p>
              <p className="text-sm font-medium text-slate-700">{getRoleLabel(user.role)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Account Email</p>
              <p className="text-sm font-medium text-slate-700">{user.email}</p>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Account Created</p>
              <p className="text-sm font-medium text-slate-700">
                {user.createdAt
                  ? new Date(user.createdAt).toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
              <Monitor className="w-5 h-5 text-[#0ea5e9]" />
              Active Sessions
            </h3>
            <p className="text-sm text-slate-500 mt-1">Manage your logged-in devices and sessions</p>
          </div>
          {sessions.filter((s) => !s.isCurrent).length > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
              onClick={handleRevokeAll}
              disabled={revoking === "all"}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              {revoking === "all" ? "Revoking..." : "Revoke All Others"}
            </Button>
          )}
        </div>
        <div className="divide-y divide-slate-100">
          {loading ? (
            <div className="px-6 py-12 text-center text-slate-500">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="px-6 py-12 text-center text-slate-500">No active sessions found</div>
          ) : (
            sessions.map((session) => (
              <div key={session.id} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center">
                    <Monitor className="w-5 h-5 text-slate-500" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-[#0f2744]">{session.browser}</p>
                      {session.isCurrent && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      IP: {session.ipAddress} · Last active:{" "}
                      {new Date(session.lastUsedAt).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      {" "}· Created:{" "}
                      {new Date(session.createdAt).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                {!session.isCurrent && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700 h-8"
                    onClick={() => handleRevokeSession(session.id)}
                    disabled={revoking === session.id}
                  >
                    {revoking === session.id ? "Revoking..." : "Revoke"}
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

interface WeightRef {
  id: number;
  cellType: string;
  voltage: string | null;
  weightKg: string;
}

interface CellModelData {
  id: number;
  modelName: string;
  cellFamily: string;
  cellHeightMm: number;
  cellsCount: number;
  weightPerCellKg: string;
}

function WeightsTab() {
  const { toast } = useToast();
  const [refs, setRefs] = useState<WeightRef[]>([]);
  const [cellModels, setCellModels] = useState<CellModelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editWeight, setEditWeight] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newCellType, setNewCellType] = useState("");
  const [newVoltage, setNewVoltage] = useState("");
  const [newWeight, setNewWeight] = useState("");
  const [saving, setSaving] = useState(false);

  const [cmEditingId, setCmEditingId] = useState<number | null>(null);
  const [cmEditWeight, setCmEditWeight] = useState("");
  const [cmShowAdd, setCmShowAdd] = useState(false);
  const [cmNewName, setCmNewName] = useState("");
  const [cmNewFamily, setCmNewFamily] = useState("");
  const [cmNewHeight, setCmNewHeight] = useState("");
  const [cmNewCells, setCmNewCells] = useState("");
  const [cmNewWeight, setCmNewWeight] = useState("");
  const [cmSearch, setCmSearch] = useState("");
  const [cmFamilyFilter, setCmFamilyFilter] = useState("");

  const fetchRefs = useCallback(async () => {
    try {
      const res = await fetch("/api/weight-reference", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setRefs(data.references);
      }
    } catch {}
    setLoading(false);
  }, []);

  const fetchCellModels = useCallback(async () => {
    try {
      const res = await fetch("/api/cell-models", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCellModels(data.models);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchRefs(); fetchCellModels(); }, [fetchRefs, fetchCellModels]);

  async function handleUpdate(id: number) {
    const kg = parseFloat(editWeight);
    if (isNaN(kg) || kg < 0) {
      toast({ title: "Error", description: "Weight must be a positive number", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/weight-reference/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ weightKg: kg }),
      });
      if (res.ok) {
        toast({ title: "Updated", description: "Weight reference updated successfully." });
        setEditingId(null);
        fetchRefs();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to update", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update weight reference", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    if (!newCellType || !newWeight) {
      toast({ title: "Error", description: "Cell type and weight are required", variant: "destructive" });
      return;
    }
    const kg = parseFloat(newWeight);
    if (isNaN(kg) || kg < 0) {
      toast({ title: "Error", description: "Weight must be a positive number", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/weight-reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ cellType: newCellType, voltage: newVoltage || null, weightKg: kg }),
      });
      if (res.ok) {
        toast({ title: "Added", description: "Weight reference added successfully." });
        setShowAdd(false);
        setNewCellType("");
        setNewVoltage("");
        setNewWeight("");
        fetchRefs();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to add", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to add weight reference", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/weight-reference/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Deleted", description: "Weight reference removed." });
        fetchRefs();
      } else {
        toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete weight reference", variant: "destructive" });
    }
  }

  async function handleCmUpdate(id: number) {
    const kg = parseFloat(cmEditWeight);
    if (isNaN(kg) || kg < 0) {
      toast({ title: "Error", description: "Weight must be a positive number", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/cell-models/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ weightPerCellKg: kg }),
      });
      if (res.ok) {
        toast({ title: "Updated", description: "Cell model weight updated." });
        setCmEditingId(null);
        fetchCellModels();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to update", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update cell model", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCmAdd() {
    if (!cmNewName || !cmNewFamily || !cmNewHeight || !cmNewCells || !cmNewWeight) {
      toast({ title: "Error", description: "All fields are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/cell-models", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          modelName: cmNewName,
          cellFamily: cmNewFamily,
          cellHeightMm: parseInt(cmNewHeight, 10),
          cellsCount: parseInt(cmNewCells, 10),
          weightPerCellKg: parseFloat(cmNewWeight),
        }),
      });
      if (res.ok) {
        toast({ title: "Added", description: "Cell model added successfully." });
        setCmShowAdd(false);
        setCmNewName(""); setCmNewFamily(""); setCmNewHeight(""); setCmNewCells(""); setCmNewWeight("");
        fetchCellModels();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to add", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to add cell model", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleCmDelete(id: number) {
    try {
      const res = await fetch(`/api/cell-models/${id}`, { method: "DELETE", credentials: "include" });
      if (res.ok) {
        toast({ title: "Deleted", description: "Cell model removed." });
        fetchCellModels();
      } else {
        toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete cell model", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
        Loading weight references...
      </div>
    );
  }

  const families = [...new Set(cellModels.map((m) => m.cellFamily))].sort();
  const filteredCellModels = cellModels.filter((m) => {
    if (cmFamilyFilter && m.cellFamily !== cmFamilyFilter) return false;
    if (cmSearch) {
      const q = cmSearch.toLowerCase().replace(/\s+/g, "");
      if (!m.modelName.toLowerCase().replace(/\s+/g, "").includes(q)) return false;
    }
    return true;
  });

  const cmGrouped: Record<string, CellModelData[]> = {};
  for (const m of filteredCellModels) {
    const key = `${m.cellFamily} — ${m.cellHeightMm}mm`;
    if (!cmGrouped[key]) cmGrouped[key] = [];
    cmGrouped[key].push(m);
  }

  const grouped: Record<string, WeightRef[]> = {};
  for (const r of refs) {
    if (!grouped[r.cellType]) grouped[r.cellType] = [];
    grouped[r.cellType].push(r);
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
              <Weight className="w-5 h-5 text-[#0ea5e9]" />
              Cell Model Reference Data
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              Granular cell model weights used for Pb Content calculation ({cellModels.length} models)
            </p>
          </div>
          <Button
            size="sm"
            className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
            onClick={() => setCmShowAdd(!cmShowAdd)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Model
          </Button>
        </div>

        {cmShowAdd && (
          <div className="px-6 py-4 bg-sky-50 border-b border-sky-100">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Model Name</label>
                <Input value={cmNewName} onChange={(e) => setCmNewName(e.target.value)} placeholder="e.g., 5 PzS 775" className="w-36 h-9 border-slate-200 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Family</label>
                <Input value={cmNewFamily} onChange={(e) => setCmNewFamily(e.target.value)} placeholder="e.g., PzS" className="w-24 h-9 border-slate-200 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Height (mm)</label>
                <Input type="number" value={cmNewHeight} onChange={(e) => setCmNewHeight(e.target.value)} placeholder="e.g., 530" className="w-24 h-9 border-slate-200 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Cells</label>
                <Input type="number" value={cmNewCells} onChange={(e) => setCmNewCells(e.target.value)} placeholder="e.g., 5" className="w-20 h-9 border-slate-200 text-sm" />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Wt/Cell (kg)</label>
                <Input type="number" step="0.001" value={cmNewWeight} onChange={(e) => setCmNewWeight(e.target.value)} placeholder="e.g., 94" className="w-28 h-9 border-slate-200 text-sm" />
              </div>
              <Button size="sm" className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white h-9" onClick={handleCmAdd} disabled={saving}>
                {saving ? "Adding..." : "Add"}
              </Button>
              <Button size="sm" variant="outline" className="h-9 border-slate-200" onClick={() => setCmShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        )}

        <div className="px-6 py-3 bg-slate-50/50 border-b border-slate-100 flex items-center gap-3 flex-wrap">
          <Input
            placeholder="Search models..."
            value={cmSearch}
            onChange={(e) => setCmSearch(e.target.value)}
            className="w-52 h-8 text-sm border-slate-200"
          />
          <select
            value={cmFamilyFilter}
            onChange={(e) => setCmFamilyFilter(e.target.value)}
            className="h-8 text-sm border border-slate-200 rounded-md px-2 bg-white text-slate-700"
          >
            <option value="">All families</option>
            {families.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <span className="text-xs text-slate-400">{filteredCellModels.length} shown</span>
        </div>

        <div className="divide-y divide-slate-100 max-h-[500px] overflow-y-auto">
          {Object.entries(cmGrouped).map(([groupKey, models]) => (
            <div key={groupKey} className="px-6 py-3">
              <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{groupKey}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {models.map((cm) => (
                  <div key={cm.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#0f2744] truncate">{cm.modelName}</p>
                      {cmEditingId === cm.id ? (
                        <div className="flex items-center gap-1.5 mt-1">
                          <Input type="number" step="0.001" min="0" value={cmEditWeight} onChange={(e) => setCmEditWeight(e.target.value)} className="w-20 h-6 text-xs border-slate-200" />
                          <span className="text-[10px] text-slate-500">kg</span>
                          <Button size="sm" className="h-6 px-1.5 text-[10px] bg-[#0ea5e9] hover:bg-[#0284c7] text-white" onClick={() => handleCmUpdate(cm.id)} disabled={saving}>
                            <Save className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="h-6 px-1.5 text-[10px]" onClick={() => setCmEditingId(null)}>
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-500">{parseFloat(cm.weightPerCellKg).toFixed(1)} kg/cell &middot; {cm.cellsCount} plates</p>
                      )}
                    </div>
                    {cmEditingId !== cm.id && (
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button onClick={() => { setCmEditingId(cm.id); setCmEditWeight(cm.weightPerCellKg); }} className="p-1 text-slate-400 hover:text-[#0ea5e9] rounded transition-colors">
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button onClick={() => handleCmDelete(cm.id)} className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors">
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {filteredCellModels.length === 0 && (
            <div className="px-6 py-8 text-center text-slate-500 text-sm">
              {cmSearch || cmFamilyFilter ? "No matching cell models found" : "No cell models configured."}
            </div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
              <Weight className="w-5 h-5 text-slate-400" />
              Legacy Weight References (Fallback)
            </h3>
            <p className="text-sm text-slate-500 mt-1">Simple type+voltage weights used when no cell model is selected</p>
          </div>
          <Button
            size="sm"
            className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
            onClick={() => setShowAdd(!showAdd)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Entry
          </Button>
        </div>

        {showAdd && (
          <div className="px-6 py-4 bg-sky-50 border-b border-sky-100">
            <div className="flex items-end gap-3 flex-wrap">
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Cell Type</label>
                <Input
                  value={newCellType}
                  onChange={(e) => setNewCellType(e.target.value)}
                  placeholder="e.g., PZB"
                  className="w-32 h-9 border-slate-200 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Voltage</label>
                <Input
                  value={newVoltage}
                  onChange={(e) => setNewVoltage(e.target.value)}
                  placeholder="e.g., 24V (or blank)"
                  className="w-40 h-9 border-slate-200 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-slate-600">Weight (kg)</label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  value={newWeight}
                  onChange={(e) => setNewWeight(e.target.value)}
                  placeholder="e.g., 360"
                  className="w-32 h-9 border-slate-200 text-sm"
                />
              </div>
              <Button
                size="sm"
                className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white h-9"
                onClick={handleAdd}
                disabled={saving}
              >
                {saving ? "Adding..." : "Add"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 border-slate-200"
                onClick={() => setShowAdd(false)}
              >
                Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {Object.entries(grouped).map(([cellType, entries]) => (
            <div key={cellType} className="px-6 py-4">
              <h4 className="text-sm font-semibold text-[#0f2744] mb-3">{cellType}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {entries.map((ref) => (
                  <div
                    key={ref.id}
                    className="flex items-center justify-between bg-slate-50 rounded-lg px-4 py-3 border border-slate-100"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-700">
                        {ref.voltage || "Per Unit"}
                      </p>
                      {editingId === ref.id ? (
                        <div className="flex items-center gap-2 mt-1">
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            value={editWeight}
                            onChange={(e) => setEditWeight(e.target.value)}
                            className="w-24 h-7 text-xs border-slate-200"
                          />
                          <span className="text-xs text-slate-500">kg</span>
                          <Button
                            size="sm"
                            className="h-7 px-2 text-xs bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
                            onClick={() => handleUpdate(ref.id)}
                            disabled={saving}
                          >
                            <Save className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs border-slate-200"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                      ) : (
                        <p className="text-lg font-bold text-[#0f2744]">
                          {parseFloat(ref.weightKg).toLocaleString("en-GB")} kg
                        </p>
                      )}
                    </div>
                    {editingId !== ref.id && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setEditingId(ref.id); setEditWeight(ref.weightKg); }}
                          className="p-1.5 text-slate-400 hover:text-[#0ea5e9] rounded transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(ref.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
          {refs.length === 0 && (
            <div className="px-6 py-12 text-center text-slate-500">
              No weight references configured. Add entries to enable auto-populate on the depot form.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface CollectionPointEntry {
  id: number;
  name: string;
  address: string;
}

function CollectionPointsTab() {
  const { toast } = useToast();
  const [points, setPoints] = useState<CollectionPointEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchPoints = useCallback(async () => {
    try {
      const res = await fetch("/api/collection-points", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setPoints(data.collectionPoints);
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => { fetchPoints(); }, [fetchPoints]);

  async function handleAdd() {
    if (!newName.trim() || !newAddress.trim()) {
      toast({ title: "Error", description: "Name and address are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/collection-points", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: newName, address: newAddress }),
      });
      if (res.ok) {
        toast({ title: "Added", description: "Collection point added successfully." });
        setShowAdd(false);
        setNewName("");
        setNewAddress("");
        fetchPoints();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to add", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to add collection point", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdate(id: number) {
    if (!editName.trim() || !editAddress.trim()) {
      toast({ title: "Error", description: "Name and address are required", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/collection-points/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ name: editName, address: editAddress }),
      });
      if (res.ok) {
        toast({ title: "Updated", description: "Collection point updated successfully." });
        setEditingId(null);
        fetchPoints();
      } else {
        const data = await res.json();
        toast({ title: "Error", description: data.message || "Failed to update", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to update collection point", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    try {
      const res = await fetch(`/api/collection-points/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        toast({ title: "Deleted", description: "Collection point removed." });
        fetchPoints();
      } else {
        toast({ title: "Error", description: "Failed to delete", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to delete collection point", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
        Loading collection points...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#0ea5e9]" />
              Collection Point Presets
            </h3>
            <p className="text-sm text-slate-500 mt-1">Pre-defined collection addresses shown in the depot form dropdown</p>
          </div>
          <Button
            size="sm"
            className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
            onClick={() => setShowAdd(!showAdd)}
          >
            <Plus className="w-4 h-4 mr-1" />
            Add Point
          </Button>
        </div>

        {showAdd && (
          <div className="px-6 py-4 bg-sky-50 border-b border-sky-100">
            <div className="space-y-3">
              <div className="flex items-end gap-3 flex-wrap">
                <div className="space-y-1 flex-1 min-w-[200px]">
                  <label className="text-xs font-medium text-slate-600">Name</label>
                  <Input
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g., Linde Basingstoke"
                    className="h-9 border-slate-200 text-sm"
                  />
                </div>
                <div className="space-y-1 flex-[2] min-w-[300px]">
                  <label className="text-xs font-medium text-slate-600">Address</label>
                  <Input
                    value={newAddress}
                    onChange={(e) => setNewAddress(e.target.value)}
                    placeholder="Full postal address"
                    className="h-9 border-slate-200 text-sm"
                  />
                </div>
                <Button
                  size="sm"
                  className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white h-9"
                  onClick={handleAdd}
                  disabled={saving}
                >
                  {saving ? "Adding..." : "Add"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-9 border-slate-200"
                  onClick={() => setShowAdd(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </div>
        )}

        <div className="divide-y divide-slate-100">
          {points.map((point) => (
            <div key={point.id} className="px-6 py-4 flex items-start justify-between gap-4">
              {editingId === point.id ? (
                <div className="flex-1 space-y-2">
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="space-y-1 flex-1 min-w-[180px]">
                      <label className="text-xs font-medium text-slate-600">Name</label>
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-9 border-slate-200 text-sm"
                      />
                    </div>
                    <div className="space-y-1 flex-[2] min-w-[250px]">
                      <label className="text-xs font-medium text-slate-600">Address</label>
                      <Input
                        value={editAddress}
                        onChange={(e) => setEditAddress(e.target.value)}
                        className="h-9 border-slate-200 text-sm"
                      />
                    </div>
                    <Button
                      size="sm"
                      className="h-9 px-3 text-xs bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
                      onClick={() => handleUpdate(point.id)}
                      disabled={saving}
                    >
                      <Save className="w-3.5 h-3.5 mr-1" />
                      {saving ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-9 px-3 text-xs border-slate-200"
                      onClick={() => setEditingId(null)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#0f2744]">{point.name}</p>
                    <p className="text-sm text-slate-500 mt-0.5 truncate">{point.address}</p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => { setEditingId(point.id); setEditName(point.name); setEditAddress(point.address); }}
                      className="p-1.5 text-slate-400 hover:text-[#0ea5e9] rounded transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(point.id)}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
          {points.length === 0 && (
            <div className="px-6 py-12 text-center text-slate-500">
              No collection points configured. Add presets to populate the depot form dropdown.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SystemTab() {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [companyName, setCompanyName] = useState("");
  const [invoicePrefix, setInvoicePrefix] = useState("");
  const [dataRetentionDays, setDataRetentionDays] = useState("");
  const [autoFetchLme, setAutoFetchLme] = useState(false);

  useEffect(() => {
    fetch("/api/settings/system", { credentials: "include" })
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (data?.settings) {
          setSettings(data.settings);
          setCompanyName(data.settings.companyName);
          setInvoicePrefix(data.settings.invoicePrefix);
          setDataRetentionDays(String(data.settings.dataRetentionDays));
          setAutoFetchLme(data.settings.autoFetchLme);
        } else {
          setCompanyName("Itinium Ltd");
          setInvoicePrefix("INV");
          setDataRetentionDays("365");
          setAutoFetchLme(false);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  async function handleSave() {
    const days = parseInt(dataRetentionDays);
    if (isNaN(days) || days < 30 || days > 3650) {
      toast({ title: "Error", description: "Data retention must be between 30 and 3650 days", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/system", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          companyName,
          invoicePrefix,
          dataRetentionDays: days,
          autoFetchLme,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSettings(data.settings);
        toast({ title: "System settings saved", description: "Configuration has been updated successfully." });
      } else {
        toast({ title: "Error", description: "Failed to save system settings", variant: "destructive" });
      }
    } catch {
      toast({ title: "Error", description: "Failed to save system settings", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
        Loading system settings...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100">
        <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#0ea5e9]" />
          System Configuration
        </h3>
        <p className="text-sm text-slate-500 mt-1">Manage system-wide settings for the portal</p>
      </div>
      <div className="p-6 space-y-6">
        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400" />
            Company Name
          </label>
          <Input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="border-slate-200 focus-visible:ring-[#0ea5e9] max-w-md"
          />
        </div>

        <Separator className="bg-slate-100" />

        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            Default Invoice Prefix
          </label>
          <Input
            value={invoicePrefix}
            onChange={(e) => setInvoicePrefix(e.target.value)}
            className="border-slate-200 focus-visible:ring-[#0ea5e9] max-w-[200px]"
            maxLength={20}
          />
          <p className="text-xs text-slate-400">Used when generating invoice references (e.g. INV-2026-001)</p>
        </div>

        <Separator className="bg-slate-100" />

        <div className="grid gap-2">
          <label className="text-sm font-medium text-slate-700 flex items-center gap-2">
            <Database className="w-4 h-4 text-slate-400" />
            Data Retention Period
          </label>
          <div className="flex items-center gap-3 max-w-md">
            <Input
              type="number"
              value={dataRetentionDays}
              onChange={(e) => setDataRetentionDays(e.target.value)}
              className="border-slate-200 focus-visible:ring-[#0ea5e9] w-[120px]"
              min={30}
              max={3650}
            />
            <span className="text-sm text-slate-500">days</span>
          </div>
          <p className="text-xs text-slate-400">How long to retain completed job data before archival (30-3650 days)</p>
        </div>

        <Separator className="bg-slate-100" />

        <div className="flex items-center justify-between max-w-md">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center flex-shrink-0 mt-0.5">
              <TrendingUp className="w-5 h-5 text-slate-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-[#0f2744]">Auto-Fetch LME Prices</p>
              <p className="text-xs text-slate-500 mt-0.5">Automatically pull LME lead prices from external API daily</p>
            </div>
          </div>
          <Switch
            checked={autoFetchLme}
            onCheckedChange={setAutoFetchLme}
            className="data-[state=checked]:bg-[#0ea5e9]"
          />
        </div>

        {settings?.updatedAt && (
          <>
            <Separator className="bg-slate-100" />
            <p className="text-xs text-slate-400">
              Last updated:{" "}
              {new Date(settings.updatedAt).toLocaleDateString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          </>
        )}
      </div>
      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100">
        <Button
          className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm"
          onClick={handleSave}
          disabled={saving}
        >
          <Save className="w-4 h-4 mr-2" />
          {saving ? "Saving..." : "Save System Settings"}
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("profile");
  const [user, setUser] = useState<UserProfile | null>(null);

  const fetchUser = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const isAdmin = user?.role === "head_office_admin";
  const visibleTabs = isAdmin ? TABS : TABS.filter((t) => t.id !== "system" && t.id !== "weights" && t.id !== "collection-points");

  return (
    <SidebarLayout
      title="Settings"
      subtitle="Manage your account, preferences, and system configuration"
    >
      <div className="flex gap-8">
        <div className="w-[220px] flex-shrink-0">
          <nav className="space-y-1 sticky top-8">
            {visibleTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors text-left ${
                  activeTab === tab.id
                    ? "bg-[#0ea5e9]/10 text-[#0ea5e9] border-l-4 border-[#0ea5e9]"
                    : "text-slate-600 hover:bg-slate-100 hover:text-[#0f2744] border-l-4 border-transparent"
                }`}
              >
                <tab.icon className="w-5 h-5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 min-w-0">
          {!user ? (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center text-slate-500">
              Loading...
            </div>
          ) : (
            <>
              {activeTab === "profile" && (
                <ProfileTab user={user} onProfileUpdated={fetchUser} />
              )}
              {activeTab === "notifications" && <NotificationsTab />}
              {activeTab === "security" && <SecurityTab user={user} />}
              {activeTab === "weights" && isAdmin && <WeightsTab />}
              {activeTab === "collection-points" && isAdmin && <CollectionPointsTab />}
              {activeTab === "system" && isAdmin && <SystemTab />}
            </>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}
