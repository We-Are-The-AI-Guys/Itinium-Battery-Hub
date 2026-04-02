import { useEffect, useState, useCallback } from "react";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Users,
  Shield,
  Package,
  UserCheck,
  UserPlus,
  Plus,
  Edit,
  X,
  Search,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface UserData {
  id: number;
  email: string;
  fullName: string;
  role: string;
  depot: string | null;
  isActive: boolean;
  lastActiveAt: string | null;
  createdAt: string;
}

interface UserStats {
  total: number;
  depotUsers: number;
  teamLeaders: number;
  adminStaff: number;
}

const ROLE_FILTERS = [
  { label: "All", value: "all" },
  { label: "Depot User", value: "depot_user" },
  { label: "Team Leader", value: "team_leader" },
  { label: "Accounts", value: "accounts" },
  { label: "Head Office", value: "head_office_admin" },
];

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    depot_user: "Depot User",
    team_leader: "Team Leader",
    accounts: "Accounts",
    head_office_admin: "Head Office",
  };
  return labels[role] || role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getRoleStyles(role: string) {
  switch (role) {
    case "depot_user":
      return { badge: "bg-slate-100 text-slate-700 border-slate-200", avatar: "bg-slate-100 text-slate-700" };
    case "team_leader":
      return { badge: "bg-teal-100 text-teal-800 border-teal-200", avatar: "bg-teal-100 text-teal-800" };
    case "accounts":
      return { badge: "bg-amber-100 text-amber-800 border-amber-200", avatar: "bg-amber-100 text-amber-800" };
    case "head_office_admin":
      return { badge: "bg-indigo-100 text-indigo-800 border-indigo-200", avatar: "bg-indigo-100 text-indigo-800" };
    default:
      return { badge: "bg-gray-100 text-gray-800 border-gray-200", avatar: "bg-gray-100 text-gray-800" };
  }
}

function getInitials(name: string) {
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
}

const USERS_PER_PAGE = 10;

export default function UserManagementPage() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const [newUser, setNewUser] = useState({
    fullName: "",
    email: "",
    role: "",
    depot: "",
  });

  const [depotList, setDepotList] = useState<string[]>([]);
  const [newUserCustomDepot, setNewUserCustomDepot] = useState(false);

  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", role: "", depot: "" });
  const [editCustomDepot, setEditCustomDepot] = useState(false);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/users/stats", { credentials: "include" });
      if (res.ok) setStats(await res.json());
    } catch {}
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        limit: String(USERS_PER_PAGE),
        offset: String((page - 1) * USERS_PER_PAGE),
      });
      if (activeFilter !== "all") {
        params.set("role", activeFilter);
      }
      if (searchQuery) params.set("search", searchQuery);

      const res = await fetch(`/api/users?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setUsersTotal(data.total);
      }
    } catch {}
  }, [page, activeFilter, searchQuery]);

  const fetchDepots = useCallback(async () => {
    try {
      const res = await fetch("/api/depots", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setDepotList(data.depots || []);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { fetchDepots(); }, [fetchDepots]);

  async function handleCreateUser() {
    setFormError("");
    if (!newUser.fullName || !newUser.email || !newUser.role) {
      setFormError("Please fill in all required fields");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: newUser.fullName,
          email: newUser.email,
          role: newUser.role,
          depot: newUser.depot || null,
        }),
      });
      if (res.ok) {
        setShowModal(false);
        setNewUser({ fullName: "", email: "", role: "", depot: "" });
        fetchUsers();
        fetchStats();
        fetchDepots();
      } else {
        const data = await res.json();
        setFormError(data.message || "Failed to create user");
      }
    } catch {
      setFormError("Failed to create user");
    } finally {
      setCreating(false);
    }
  }

  function openEditModal(user: UserData) {
    setEditingUser(user);
    const depotVal = user.depot || "";
    setEditForm({ fullName: user.fullName, role: user.role, depot: depotVal });
    setEditCustomDepot(depotVal !== "" && depotList.length > 0 && !depotList.includes(depotVal));
    setEditError("");
  }

  async function handleEditUser() {
    if (!editingUser) return;
    setEditError("");
    if (!editForm.fullName) {
      setEditError("Name is required");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          fullName: editForm.fullName,
          role: editForm.role,
          depot: editForm.depot || null,
        }),
      });
      if (res.ok) {
        setEditingUser(null);
        fetchUsers();
        fetchStats();
        fetchDepots();
      } else {
        const data = await res.json();
        setEditError(data.message || "Failed to update user");
      }
    } catch {
      setEditError("Failed to update user");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(user: UserData) {
    try {
      await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ isActive: !user.isActive }),
      });
      fetchUsers();
      fetchStats();
    } catch {}
  }

  const totalPages = Math.ceil(usersTotal / USERS_PER_PAGE);

  return (
    <SidebarLayout
      title="User Management"
      subtitle="Manage team members, roles, and access permissions"
    >
      <div className="space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-[#0f2744] p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Total Users</p>
                <h3 className="text-3xl font-bold text-[#0f2744]">{stats?.total ?? "..."}</h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center">
                <Users className="w-5 h-5 text-slate-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-slate-400 p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Depot Users</p>
                <h3 className="text-3xl font-bold text-[#0f2744]">{stats?.depotUsers ?? "..."}</h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center">
                <Package className="w-5 h-5 text-slate-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-teal-500 p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Team Leaders</p>
                <h3 className="text-3xl font-bold text-[#0f2744]">{stats?.teamLeaders ?? "..."}</h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                <UserCheck className="w-5 h-5 text-teal-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-indigo-500 p-5">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-sm font-medium text-slate-500 mb-1">Admin Staff</p>
                <h3 className="text-3xl font-bold text-[#0f2744]">{stats?.adminStaff ?? "..."}</h3>
              </div>
              <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Shield className="w-5 h-5 text-indigo-600" />
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <h3 className="text-lg font-bold text-[#0f2744]">All Users</h3>

            <div className="flex items-center gap-4">
              <div className="flex flex-wrap bg-slate-100 p-1 rounded-lg">
                {ROLE_FILTERS.map((filter) => (
                  <button
                    key={filter.value}
                    onClick={() => { setActiveFilter(filter.value); setPage(1); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                      activeFilter === filter.value
                        ? "bg-white text-[#0f2744] shadow-sm"
                        : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="px-6 py-3 border-b border-slate-100 flex items-center justify-between gap-4">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-9 h-9 text-sm bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
              />
            </div>
            <Button
              className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm"
              onClick={() => { setShowModal(true); setFormError(""); setNewUserCustomDepot(false); }}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add New User
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">User</th>
                  <th className="px-6 py-4 font-semibold">Role</th>
                  <th className="px-6 py-4 font-semibold">Depot/Location</th>
                  <th className="px-6 py-4 font-semibold">Status</th>
                  <th className="px-6 py-4 font-semibold">Last Active</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user, index) => {
                  const roleStyle = getRoleStyles(user.role);
                  return (
                    <tr
                      key={user.id}
                      className={`hover:bg-slate-50/80 transition-colors group ${index % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${roleStyle.avatar}`}>
                            {getInitials(user.fullName)}
                          </div>
                          <div>
                            <div className="font-medium text-[#0f2744]">{user.fullName}</div>
                            <div className="text-xs text-slate-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <Badge
                          variant="outline"
                          className={`font-medium shadow-none ${roleStyle.badge}`}
                        >
                          {getRoleLabel(user.role)}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-slate-600">{user.depot || "Head Office"}</td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full ${user.isActive ? "bg-green-500" : "bg-slate-400"}`}></span>
                          <span className={`font-medium ${user.isActive ? "text-slate-700" : "text-slate-500"}`}>
                            {user.isActive ? "Active" : "Inactive"}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-slate-500">
                        {user.lastActiveAt
                          ? new Date(user.lastActiveAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                          : new Date(user.createdAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 px-2.5 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-[#0f2744] transition-colors"
                            onClick={() => openEditModal(user)}
                          >
                            <Edit className="w-3.5 h-3.5 mr-1" />
                            Edit
                          </Button>
                          <button
                            className={`text-xs font-medium hover:underline ${user.isActive ? "text-red-600 hover:text-red-700" : "text-green-600 hover:text-green-700"}`}
                            onClick={() => handleToggleActive(user)}
                          >
                            {user.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
            <span className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-900">{users.length > 0 ? (page - 1) * USERS_PER_PAGE + 1 : 0}-{Math.min(page * USERS_PER_PAGE, usersTotal)}</span> of <span className="font-medium text-slate-900">{usersTotal}</span> users
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 disabled:opacity-50"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  variant="outline"
                  size="sm"
                  className={`h-8 w-8 ${
                    p === page
                      ? "bg-[#0ea5e9] text-white border-transparent hover:bg-[#0284c7] hover:text-white"
                      : "text-slate-600"
                  }`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8 disabled:opacity-50"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[500px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-[#0ea5e9]" />
                Add New User
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {formError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  {formError}
                </div>
              )}

              <div className="space-y-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700">Full Name</label>
                  <Input
                    placeholder="e.g. Jane Smith"
                    className="border-slate-200 focus-visible:ring-[#0ea5e9]"
                    value={newUser.fullName}
                    onChange={(e) => setNewUser({ ...newUser, fullName: e.target.value })}
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700">Email Address</label>
                  <Input
                    placeholder="jane.smith@example.com"
                    type="email"
                    className="border-slate-200 focus-visible:ring-[#0ea5e9]"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700">Role</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none h-9 rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0ea5e9] pr-8"
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                    >
                      <option value="" disabled>Select a role...</option>
                      <option value="depot_user">Depot User</option>
                      <option value="team_leader">Team Leader</option>
                      <option value="accounts">Accounts</option>
                      <option value="head_office_admin">Head Office</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700">
                    Assigned Depot
                    <span className="text-xs text-slate-500 font-normal ml-2">(Required for Depot User and Team Leader roles)</span>
                  </label>
                  {newUserCustomDepot ? (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter new depot name..."
                        className="border-slate-200 focus-visible:ring-[#0ea5e9] flex-1"
                        value={newUser.depot}
                        onChange={(e) => setNewUser({ ...newUser, depot: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 px-2.5 text-slate-500 border-slate-200"
                        onClick={() => { setNewUserCustomDepot(false); setNewUser({ ...newUser, depot: "" }); }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        className="w-full appearance-none h-9 rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0ea5e9] pr-8"
                        value={newUser.depot}
                        onChange={(e) => {
                          if (e.target.value === "__other__") {
                            setNewUserCustomDepot(true);
                            setNewUser({ ...newUser, depot: "" });
                          } else {
                            setNewUser({ ...newUser, depot: e.target.value });
                          }
                        }}
                      >
                        <option value="">Select a depot...</option>
                        {depotList.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                        <option value="__other__">Other (enter manually)...</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-2 space-y-3">
                <div className="flex items-center space-x-2">
                  <Checkbox id="2fa" className="border-slate-300 data-[state=checked]:bg-[#0ea5e9] data-[state=checked]:border-[#0ea5e9]" />
                  <label
                    htmlFor="2fa"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-700"
                  >
                    Enable Two-Factor Authentication (2FA)
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox id="welcome-email" defaultChecked className="border-slate-300 data-[state=checked]:bg-[#0ea5e9] data-[state=checked]:border-[#0ea5e9]" />
                  <label
                    htmlFor="welcome-email"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-slate-700"
                  >
                    Send welcome email with login credentials
                  </label>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowModal(false)}
                className="border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </Button>
              <Button
                className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm"
                onClick={handleCreateUser}
                disabled={creating}
              >
                {creating ? "Creating..." : "Create User"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[500px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
                <Edit className="w-5 h-5 text-[#0ea5e9]" />
                Edit User
              </h3>
              <button
                onClick={() => setEditingUser(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {editError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">
                  {editError}
                </div>
              )}

              <div className="space-y-4">
                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700">Full Name</label>
                  <Input
                    className="border-slate-200 focus-visible:ring-[#0ea5e9]"
                    value={editForm.fullName}
                    onChange={(e) => setEditForm({ ...editForm, fullName: e.target.value })}
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700">Email</label>
                  <Input
                    className="border-slate-200 bg-slate-50 text-slate-500 cursor-not-allowed"
                    value={editingUser.email}
                    disabled
                  />
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700">Role</label>
                  <div className="relative">
                    <select
                      className="w-full appearance-none h-9 rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0ea5e9] pr-8"
                      value={editForm.role}
                      onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                    >
                      <option value="depot_user">Depot User</option>
                      <option value="team_leader">Team Leader</option>
                      <option value="accounts">Accounts</option>
                      <option value="head_office_admin">Head Office</option>
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div className="grid gap-2">
                  <label className="text-sm font-medium text-slate-700">Assigned Depot</label>
                  {editCustomDepot ? (
                    <div className="flex gap-2">
                      <Input
                        placeholder="Enter new depot name..."
                        className="border-slate-200 focus-visible:ring-[#0ea5e9] flex-1"
                        value={editForm.depot}
                        onChange={(e) => setEditForm({ ...editForm, depot: e.target.value })}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 px-2.5 text-slate-500 border-slate-200"
                        onClick={() => { setEditCustomDepot(false); setEditForm({ ...editForm, depot: "" }); }}
                      >
                        <X className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        className="w-full appearance-none h-9 rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0ea5e9] pr-8"
                        value={depotList.includes(editForm.depot) ? editForm.depot : (editForm.depot ? "__other__" : "")}
                        onChange={(e) => {
                          if (e.target.value === "__other__") {
                            setEditCustomDepot(true);
                            setEditForm({ ...editForm, depot: "" });
                          } else {
                            setEditForm({ ...editForm, depot: e.target.value });
                          }
                        }}
                      >
                        <option value="">Select a depot...</option>
                        {depotList.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                        <option value="__other__">Other (enter manually)...</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setEditingUser(null)}
                className="border-slate-200 text-slate-700 hover:bg-slate-100"
              >
                Cancel
              </Button>
              <Button
                className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm"
                onClick={handleEditUser}
                disabled={saving}
              >
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
