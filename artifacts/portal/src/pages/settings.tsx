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
  const visibleTabs = isAdmin ? TABS : TABS.filter((t) => t.id !== "system");

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
              {activeTab === "system" && isAdmin && <SystemTab />}
            </>
          )}
        </div>
      </div>
    </SidebarLayout>
  );
}
