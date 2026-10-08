import { useEffect, useState, useCallback } from "react";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { shareableSignInLink } from "@/lib/shareable-sign-in-link";
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
  KeyRound,
  Link as LinkIcon,
  Copy,
  Check,
  Eye,
  EyeOff,
  CheckCircle2,
} from "lucide-react";

interface UserData {
  permittedLocationIds: number[];
  id: number;
  email: string;
  fullName: string;
  role: string;
  depot: string | null;
  clientId: number | null;
  locationId: number | null;
  clientName: string | null;
  locationName: string | null;
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

interface ClientOption {
  id: number;
  name: string;
}

interface LocationOption {
  id: number;
  name: string;
  clientId: number;
}

interface CurrentUser {
  role: string;
  clientId: number | null;
  clientName: string | null;
}

function getRoleLabel(role: string) {
  const labels: Record<string, string> = {
    depot_user: "Depot User",
    team_leader: "Team Leader",
    accounts: "Accounts",
    head_office_admin: "Head Office",
    collection_company: "Collection Company",
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
  const [newPermittedIds, setNewPermittedIds] = useState<number[]>([]);
  const [editPermittedIds, setEditPermittedIds] = useState<number[]>([]);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [stats, setStats] = useState<UserStats | null>(null);
  const [users, setUsers] = useState<UserData[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [formError, setFormError] = useState("");

  const [clients, setClients] = useState<ClientOption[]>([]);
  const [locationOptions, setLocationOptions] = useState<LocationOption[]>([]);

  const [newUser, setNewUser] = useState({
    fullName: "",
    email: "",
    role: "",
    clientId: "",
    locationId: "",
    collectionCompanyId: "",
  });
  const [collectionCompanies, setCollectionCompanies] = useState<{ id: number; name: string }[]>([]);

  const [createdTempPassword, setCreatedTempPassword] = useState<string | null>(null);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [linkError, setLinkError] = useState("");

  const [editingUser, setEditingUser] = useState<UserData | null>(null);
  const [editForm, setEditForm] = useState({ fullName: "", role: "", clientId: "", locationId: "" });
  const [editLocationOptions, setEditLocationOptions] = useState<LocationOption[]>([]);
  const [editError, setEditError] = useState("");
  const [saving, setSaving] = useState(false);

  const [changingPasswordFor, setChangingPasswordFor] = useState<UserData | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setCurrentUser({
            role: data.user.role,
            clientId: data.user.clientId,
            clientName: data.user.clientName,
          });
          if (data.user.role === "team_leader") {
            setActiveFilter("depot_user");
          } else {
            setActiveFilter("all");
          }
        }
      })
      .catch(() => {});
  }, []);

  const isAdmin = currentUser?.role === "head_office_admin";
  const isTeamLeader = currentUser?.role === "team_leader";

  const roleFilters = isAdmin
    ? [
        { label: "All", value: "all" },
        { label: "Depot User", value: "depot_user" },
        { label: "Team Leader", value: "team_leader" },
        { label: "Accounts", value: "accounts" },
        { label: "Head Office", value: "head_office_admin" },
      ]
    : [
        { label: "All", value: "all" },
        { label: "Depot User", value: "depot_user" },
      ];

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
      if (activeFilter !== "all") params.set("role", activeFilter);
      if (searchQuery) params.set("search", searchQuery);

      const res = await fetch(`/api/users?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.users);
        setUsersTotal(data.total);
      }
    } catch {}
  }, [page, activeFilter, searchQuery]);

  const fetchClients = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/clients", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setClients(data.clients.map((c: { id: number; name: string }) => ({ id: c.id, name: c.name })));
      }
    } catch {}
  }, [isAdmin]);

  const fetchCollectionCompanies = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const res = await fetch("/api/collection-companies", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setCollectionCompanies(
          (data.companies || []).map((c: { id: number; name: string }) => ({ id: c.id, name: c.name }))
        );
      }
    } catch {}
  }, [isAdmin]);

  useEffect(() => { fetchStats(); }, [fetchStats]);
  useEffect(() => { fetchUsers(); }, [fetchUsers]);
  useEffect(() => { fetchClients(); }, [fetchClients]);
  useEffect(() => { fetchCollectionCompanies(); }, [fetchCollectionCompanies]);

  async function fetchLocationsForClient(clientId: number): Promise<LocationOption[]> {
    try {
      const res = await fetch(`/api/clients/${clientId}/locations`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        return data.locations.map((l: { id: number; name: string; clientId: number }) => ({
          id: l.id,
          name: l.name,
          clientId: l.clientId,
        }));
      }
    } catch {}
    return [];
  }

  useEffect(() => {
    if (isTeamLeader && currentUser?.clientId) {
      fetchLocationsForClient(currentUser.clientId).then(setLocationOptions);
    }
  }, [isTeamLeader, currentUser?.clientId]);

  async function handleNewUserClientChange(clientIdStr: string) {
    setNewPermittedIds([]);
    setNewUser((prev) => ({ ...prev, clientId: clientIdStr, locationId: "" }));
    if (clientIdStr) {
      const locs = await fetchLocationsForClient(parseInt(clientIdStr));
      setLocationOptions(locs);
    } else {
      setLocationOptions([]);
    }
  }

  async function handleCreateUser() {
    setFormError("");
    if (!newUser.fullName || !newUser.email || !newUser.role) {
      setFormError("Please fill in all required fields");
      return;
    }

    const role = newUser.role;
    const needsClient = role === "depot_user" || role === "team_leader";

    let clientId: number | null = null;
    let locationId: number | null = null;

    if (isTeamLeader) {
      clientId = currentUser?.clientId || null;
      locationId = newUser.locationId ? parseInt(newUser.locationId) : null;
    } else if (isAdmin) {
      clientId = newUser.clientId ? parseInt(newUser.clientId) : null;
      locationId = newUser.locationId ? parseInt(newUser.locationId) : null;
    }

    if (needsClient && !clientId) {
      setFormError("Client is required for this role");
      return;
    }
    if (role === "collection_company" && !newUser.collectionCompanyId) {
      setFormError("Collection company is required for this role");
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
          clientId,
          locationId,
          permittedLocationIds: needsClient ? newPermittedIds : [],
          collectionCompanyId: newUser.collectionCompanyId ? parseInt(newUser.collectionCompanyId) : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setCreatedTempPassword(data.tempPassword || null);
        setNewUser({ fullName: "", email: "", role: "", clientId: "", locationId: "", collectionCompanyId: "" });
        setNewPermittedIds([]);
        fetchUsers();
        fetchStats();
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

  async function handleChangePassword() {
    if (!changingPasswordFor) return;
    setPasswordError("");
    if (newPassword.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await fetch(`/api/users/${changingPasswordFor.id}/password`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ password: newPassword }),
      });
      if (res.ok) {
        setPasswordSuccess(true);
        setNewPassword("");
      } else {
        const data = await res.json();
        setPasswordError(data.message || "Failed to change password");
      }
    } catch {
      setPasswordError("Failed to change password");
    } finally {
      setPasswordSaving(false);
    }
  }

  function closeTempPasswordModal() {
    setShowModal(false);
    setCreatedTempPassword(null);
    setCopiedPassword(false);
  }

  function openChangePasswordModal(user: UserData) {
    setChangingPasswordFor(user);
    setNewPassword("");
    setShowNewPassword(false);
    setPasswordError("");
    setPasswordSuccess(false);
  }

  async function copyToClipboard(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedPassword(true);
      setTimeout(() => setCopiedPassword(false), 2000);
    } catch {
      /* fallback: select input */
    }
  }

  async function copySignInLink() {
    setLinkError("");
    try {
      await navigator.clipboard.writeText(shareableSignInLink());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      setLinkError("Could not copy the sign-in link. Your clipboard may still contain a password; do not paste it as a link. Check the portal address or clipboard permissions.");
    }
  }

  async function openEditModal(user: UserData) {
    setEditPermittedIds(user.permittedLocationIds ?? []);
    setEditingUser(user);
    const clientIdStr = user.clientId ? String(user.clientId) : "";
    const locationIdStr = user.locationId ? String(user.locationId) : "";
    setEditForm({ fullName: user.fullName, role: user.role, clientId: clientIdStr, locationId: locationIdStr });
    setEditError("");

    if (user.clientId) {
      const locs = await fetchLocationsForClient(user.clientId);
      setEditLocationOptions(locs);
    } else {
      setEditLocationOptions([]);
    }
  }

  async function handleEditClientChange(clientIdStr: string) {
    setEditPermittedIds([]);
    setEditForm((prev) => ({ ...prev, clientId: clientIdStr, locationId: "" }));
    if (clientIdStr) {
      const locs = await fetchLocationsForClient(parseInt(clientIdStr));
      setEditLocationOptions(locs);
    } else {
      setEditLocationOptions([]);
    }
  }

  async function handleEditUser() {
    if (!editingUser) return;
    setEditError("");
    if (!editForm.fullName) {
      setEditError("Name is required");
      return;
    }

    if (isAdmin) {
      const role = editForm.role;
      const needsClient = role === "depot_user" || role === "team_leader";
      if (needsClient && !editForm.clientId) {
        setEditError("Client is required for this role");
        return;
      }
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = { fullName: editForm.fullName, permittedLocationIds: ["team_leader", "depot_user"].includes(editForm.role) ? editPermittedIds : [] };

      if (isAdmin) {
        body.role = editForm.role;
        body.clientId = editForm.clientId ? parseInt(editForm.clientId) : null;
        body.locationId = editForm.locationId ? parseInt(editForm.locationId) : null;
      } else if (isTeamLeader) {
        body.locationId = editForm.locationId ? parseInt(editForm.locationId) : null;
      }

      const res = await fetch(`/api/users/${editingUser.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setEditingUser(null);
        fetchUsers();
        fetchStats();
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

  const showClientColumn = isAdmin;
  const showLocationColumn = true;

  const availableCreateRoles = isTeamLeader
    ? [{ value: "depot_user", label: "Depot User" }]
    : [
        { value: "depot_user", label: "Depot User" },
        { value: "team_leader", label: "Team Leader" },
        { value: "accounts", label: "Accounts" },
        { value: "head_office_admin", label: "Head Office" },
        { value: "collection_company", label: "Collection Company" },
      ];

  const needsClientForNewUser = newUser.role === "depot_user" || newUser.role === "team_leader";
  const needsLocationForNewUser = ["depot_user", "team_leader"].includes(newUser.role);

  return (
    <SidebarLayout
      title="User Management"
      subtitle={isTeamLeader ? `Manage users for ${currentUser?.clientName || "your client"}` : "Manage team members, roles, and access permissions"}
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
            <h3 className="text-lg font-bold text-[#0f2744]">
              {isTeamLeader ? "Team Users" : "All Users"}
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex flex-wrap bg-slate-100 p-1 rounded-lg">
                {roleFilters.map((filter) => (
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

          <div className="px-6 py-3 border-b border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Search users..."
                value={searchQuery}
                onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
                className="pl-9 h-9 text-sm bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={copySignInLink}>
                {copiedLink ? <Check className="w-4 h-4 mr-2" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                {copiedLink ? "Link copied" : "Copy sign-in link"}
              </Button>
              <Button
                className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm"
                onClick={() => { setShowModal(true); setFormError(""); }}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add New User
              </Button>
            </div>
          </div>
          {linkError && <p role="alert" className="px-6 py-2 text-sm text-red-700">{linkError}</p>}

          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-4 font-semibold">User</th>
                  <th className="px-6 py-4 font-semibold">Role</th>
                  {showClientColumn && <th className="px-6 py-4 font-semibold">Client</th>}
                  {showLocationColumn && <th className="px-6 py-4 font-semibold">Location</th>}
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
                        <Badge variant="outline" className={`font-medium shadow-none ${roleStyle.badge}`}>
                          {getRoleLabel(user.role)}
                        </Badge>
                      </td>
                      {showClientColumn && (
                        <td className="px-6 py-4 text-slate-600">{user.clientName || "Head Office"}</td>
                      )}
                      {showLocationColumn && (
                        <td className="px-6 py-4 text-slate-600">{user.locationName || "No default"}<div className="text-xs">{user.permittedLocationIds?.length || 0} permitted locations</div></td>
                      )}
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
                        {(isAdmin || (isTeamLeader && user.role === "depot_user")) ? (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-[#0f2744] transition-colors"
                              onClick={() => openEditModal(user)}
                            >
                              <Edit className="w-3.5 h-3.5 mr-1" />
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-7 px-2.5 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-[#0f2744] transition-colors"
                              onClick={() => openChangePasswordModal(user)}
                            >
                              <KeyRound className="w-3.5 h-3.5 mr-1" />
                              Password
                            </Button>
                            <button
                              className={`text-xs font-medium hover:underline ${user.isActive ? "text-red-600 hover:text-red-700" : "text-green-600 hover:text-green-700"}`}
                              onClick={() => handleToggleActive(user)}
                            >
                              {user.isActive ? "Deactivate" : "Activate"}
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr>
                    <td colSpan={showClientColumn ? 7 : 6} className="px-6 py-12 text-center text-slate-500">
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
              <Button variant="outline" size="icon" className="h-8 w-8 disabled:opacity-50" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  variant="outline"
                  size="sm"
                  className={`h-8 w-8 ${p === page ? "bg-[#0ea5e9] text-white border-transparent hover:bg-[#0284c7] hover:text-white" : "text-slate-600"}`}
                  onClick={() => setPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button variant="outline" size="icon" className="h-8 w-8 disabled:opacity-50" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[500px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {createdTempPassword ? (
              <>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    User Created
                  </h3>
                </div>
                <div className="p-6 space-y-5">
                  <p className="text-sm text-slate-600">
                    The account has been created. This temporary password will only be shown once. Send it privately, separately from the sign-in link. Never share a screenshot of this page.
                  </p>
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2">
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Temporary Password</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-base font-mono font-bold text-[#0f2744] tracking-widest select-all">
                        {createdTempPassword}
                      </code>
                      <button
                        onClick={() => copyToClipboard(createdTempPassword)}
                        className="p-2 rounded-md hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-colors"
                        title="Copy to clipboard"
                      >
                        {copiedPassword ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  <div className="border-t border-slate-200 pt-4 space-y-2">
                    <p className="text-sm text-slate-600">The sign-in link contains no email, password or session details. Opening it alone does not sign anyone in.</p>
                    <Button variant="outline" onClick={copySignInLink}>
                      {copiedLink ? <Check className="w-4 h-4 mr-2" /> : <LinkIcon className="w-4 h-4 mr-2" />}
                      {copiedLink ? "Link copied" : "Copy sign-in link"}
                    </Button>
                    {linkError && <p role="alert" className="text-sm text-red-700">{linkError}</p>}
                  </div>
                  <p className="text-xs text-slate-400">
                    The user can change their password after logging in via Settings, or via "Forgot Password" on the login page.
                  </p>
                </div>
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
                  <Button className="bg-[#0f2744] hover:bg-[#1e3a5f] text-white border-none shadow-sm" onClick={closeTempPasswordModal}>
                    Done
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
                    <UserPlus className="w-5 h-5 text-[#0ea5e9]" />
                    Add New User
                  </h3>
                  <button onClick={() => setShowModal(false)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-6 space-y-5">
                  {formError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{formError}</div>
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
                          {availableCreateRoles.map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      </div>
                    </div>

                    {isAdmin && newUser.role === "collection_company" && (
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-700">
                          Collection Company <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <select
                            className="w-full appearance-none h-9 rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0ea5e9] pr-8"
                            value={newUser.collectionCompanyId}
                            onChange={(e) => setNewUser({ ...newUser, collectionCompanyId: e.target.value })}
                            data-testid="select-collection-company"
                          >
                            <option value="">Select a company...</option>
                            {collectionCompanies.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    )}

                    {isAdmin && needsClientForNewUser && (
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-700">
                          Client <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <select
                            className="w-full appearance-none h-9 rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0ea5e9] pr-8"
                            value={newUser.clientId}
                            onChange={(e) => handleNewUserClientChange(e.target.value)}
                          >
                            <option value="">Select a client...</option>
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    )}

                    {needsLocationForNewUser && (
                      <div className="grid gap-2">
                        <label className="text-sm font-medium">Permitted locations</label>
                        <select multiple aria-label="Permitted locations" className="border rounded p-2" value={newPermittedIds.map(String)} onChange={e => {
                          const ids = Array.from(e.target.selectedOptions, option => Number(option.value));
                          setNewPermittedIds(ids);
                          if (!ids.includes(Number(newUser.locationId))) setNewUser(prev => ({ ...prev, locationId: "" }));
                        }}>
                          {locationOptions.filter(l => l.clientId === Number(isTeamLeader ? currentUser?.clientId : newUser.clientId)).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                        <p className="text-xs text-slate-500">Select one or more sites (Ctrl/Cmd-click). No sites means no depot data access.</p>
                        <label className="text-sm font-medium text-slate-700">
                          Default location (optional)
                        </label>
                        <div className="relative">
                          <select
                            className="w-full appearance-none h-9 rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0ea5e9] pr-8"
                            value={newUser.locationId}
                            onChange={(e) => {
                              setNewUser({ ...newUser, locationId: e.target.value });
                              if (isAdmin && e.target.value) setNewPermittedIds(ids => [...new Set([...ids, Number(e.target.value)])]);
                            }}
                          >
                            <option value="">Select a location...</option>
                            {locationOptions.filter(l => (isAdmin || newPermittedIds.includes(l.id)) && l.clientId === Number(isTeamLeader ? currentUser?.clientId : newUser.clientId)).map((l) => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
                  <Button variant="outline" onClick={() => setShowModal(false)} className="border-slate-200 text-slate-700 hover:bg-slate-100">Cancel</Button>
                  <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm" onClick={handleCreateUser} disabled={creating}>
                    {creating ? "Creating..." : "Create User"}
                  </Button>
                </div>
              </>
            )}
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
              <button onClick={() => setEditingUser(null)} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {editError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{editError}</div>
              )}
              {["depot_user", "team_leader"].includes(editForm.role) && (
                <div className="grid gap-2">
                  <label className="text-sm font-medium">Permitted locations</label>
                  <select multiple aria-label="Permitted locations" className="border rounded p-2" value={editPermittedIds.map(String)} onChange={e => {
                    const ids = Array.from(e.target.selectedOptions, option => Number(option.value));
                    setEditPermittedIds(ids);
                    if (!ids.includes(Number(editForm.locationId))) setEditForm(prev => ({ ...prev, locationId: "" }));
                  }}>
                    {editLocationOptions.filter(l => l.clientId === Number(editForm.clientId)).map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  <p className="text-xs text-slate-500">Select one or more sites (Ctrl/Cmd-click). No sites means no depot data access.</p>
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

                {isAdmin && (
                  <>
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

                    {(editForm.role === "depot_user" || editForm.role === "team_leader") && (
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-700">Client</label>
                        <div className="relative">
                          <select
                            className="w-full appearance-none h-9 rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0ea5e9] pr-8"
                            value={editForm.clientId}
                            onChange={(e) => handleEditClientChange(e.target.value)}
                          >
                            <option value="">Select a client...</option>
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    )}

                    {["depot_user", "team_leader"].includes(editForm.role) && editForm.clientId && (
                      <div className="grid gap-2">
                        <label className="text-sm font-medium text-slate-700">Default location</label>
                        <div className="relative">
                          <select
                            className="w-full appearance-none h-9 rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0ea5e9] pr-8"
                            value={editForm.locationId}
                            onChange={(e) => {
                              setEditForm({ ...editForm, locationId: e.target.value });
                              if (e.target.value) setEditPermittedIds(ids => [...new Set([...ids, Number(e.target.value)])]);
                            }}
                          >
                            <option value="">Select a location...</option>
                            {editLocationOptions.filter(l => l.clientId === Number(editForm.clientId)).map((l) => (
                              <option key={l.id} value={l.id}>{l.name}</option>
                            ))}
                          </select>
                          <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    )}
                  </>
                )}

                {isTeamLeader && (
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700">Default location</label>
                    <div className="relative">
                      <select
                        className="w-full appearance-none h-9 rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0ea5e9] pr-8"
                        value={editForm.locationId}
                        onChange={(e) => setEditForm({ ...editForm, locationId: e.target.value })}
                      >
                        <option value="">Select a location...</option>
                        {locationOptions.filter(l => editPermittedIds.includes(l.id)).map((l) => (
                          <option key={l.id} value={l.id}>{l.name}</option>
                        ))}
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setEditingUser(null)} className="border-slate-200 text-slate-700 hover:bg-slate-100">Cancel</Button>
              <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm" onClick={handleEditUser} disabled={saving}>
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {changingPasswordFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-[2px]">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-[420px] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="text-lg font-bold text-[#0f2744] flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-[#0ea5e9]" />
                Change Password
              </h3>
              <button
                onClick={() => setChangingPasswordFor(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs ${getRoleStyles(changingPasswordFor.role).avatar}`}>
                  {getInitials(changingPasswordFor.fullName)}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-700">{changingPasswordFor.fullName}</p>
                  <p className="text-xs text-slate-500">{changingPasswordFor.email}</p>
                </div>
              </div>

              {passwordSuccess ? (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-700">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Password updated successfully. Share the new password with the user.
                </div>
              ) : (
                <>
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700">New Password</label>
                    <div className="relative">
                      <Input
                        type={showNewPassword ? "text" : "password"}
                        placeholder="Min. 6 characters"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="border-slate-200 focus-visible:ring-[#0ea5e9] pr-10"
                        onKeyDown={(e) => { if (e.key === "Enter") handleChangePassword(); }}
                      />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword((v) => !v)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {passwordError && (
                    <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg p-3">{passwordError}</div>
                  )}
                </>
              )}
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
              <Button variant="outline" onClick={() => setChangingPasswordFor(null)} className="border-slate-200 text-slate-700 hover:bg-slate-100">
                {passwordSuccess ? "Close" : "Cancel"}
              </Button>
              {!passwordSuccess && (
                <Button
                  className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm"
                  onClick={handleChangePassword}
                  disabled={passwordSaving || newPassword.length < 6}
                >
                  {passwordSaving ? "Saving..." : "Set Password"}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </SidebarLayout>
  );
}
