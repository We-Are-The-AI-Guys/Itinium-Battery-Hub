import React, { useState } from "react";
import {
  Shield,
  LayoutDashboard,
  Briefcase,
  BarChart3,
  LineChart,
  Users,
  Settings,
  HelpCircle,
  LogOut,
  Bell,
  Search,
  Plus,
  UserPlus,
  UserCheck,
  Package,
  Edit,
  X,
  Check,
  Mail,
  Lock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", id: "dashboard" },
  { icon: Briefcase, label: "Job Management", id: "jobs" },
  { icon: BarChart3, label: "KPI Reporting", id: "kpi" },
  { icon: LineChart, label: "LME Pricing", id: "lme" },
  { icon: Users, label: "User Access", id: "users" },
];

const secondaryNavItems = [
  { icon: Settings, label: "Settings", id: "settings" },
  { icon: HelpCircle, label: "Help & Support", id: "help" },
];

const mockUsers = [
  { name: "Alex Johnson", email: "alex.j@greenfield.co.uk", role: "Depot User", depot: "Birmingham Central", status: "Active", lastActive: "17 Mar 2026" },
  { name: "Tom Whitaker", email: "t.whitaker@metrowaste.co.uk", role: "Team Leader", depot: "Manchester North", status: "Active", lastActive: "17 Mar 2026" },
  { name: "Rachel Adams", email: "r.adams@itinium.co.uk", role: "Accounts", depot: "Head Office", status: "Active", lastActive: "17 Mar 2026" },
  { name: "Sarah Mitchell", email: "s.mitchell@itinium.co.uk", role: "Head Office", depot: "Head Office", status: "Active", lastActive: "17 Mar 2026" },
  { name: "James Patel", email: "j.patel@ecocollect.co.uk", role: "Depot User", depot: "Leeds Hub", status: "Active", lastActive: "16 Mar 2026" },
  { name: "Emma Clarke", email: "e.clarke@cleanpower.co.uk", role: "Depot User", depot: "Bristol South", status: "Active", lastActive: "16 Mar 2026" },
  { name: "David Osei", email: "d.osei@thamesbatt.co.uk", role: "Team Leader", depot: "Reading Central", status: "Active", lastActive: "15 Mar 2026" },
  { name: "Priya Sharma", email: "p.sharma@nationalgrid.co.uk", role: "Depot User", depot: "London Depot", status: "Inactive", lastActive: "01 Mar 2026" },
  { name: "Mark Thompson", email: "m.thompson@northernenergy.co.uk", role: "Depot User", depot: "Sheffield East", status: "Active", lastActive: "15 Mar 2026" },
  { name: "Lisa Chen", email: "l.chen@itinium.co.uk", role: "Accounts", depot: "Head Office", status: "Active", lastActive: "14 Mar 2026" },
];

const getInitials = (name: string) => {
  return name.split(" ").map(n => n[0]).join("").substring(0, 2);
};

const getRoleStyles = (role: string) => {
  switch (role) {
    case "Depot User":
      return { badge: "bg-slate-100 text-slate-700 border-slate-200", avatar: "bg-slate-100 text-slate-700" };
    case "Team Leader":
      return { badge: "bg-teal-100 text-teal-800 border-teal-200", avatar: "bg-teal-100 text-teal-800" };
    case "Accounts":
      return { badge: "bg-amber-100 text-amber-800 border-amber-200", avatar: "bg-amber-100 text-amber-800" };
    case "Head Office":
      return { badge: "bg-indigo-100 text-indigo-800 border-indigo-200", avatar: "bg-indigo-100 text-indigo-800" };
    default:
      return { badge: "bg-gray-100 text-gray-800 border-gray-200", avatar: "bg-gray-100 text-gray-800" };
  }
};

export function UserManagement() {
  const [activeNav, setActiveNav] = useState("users");
  const [activeFilter, setActiveFilter] = useState("All");
  const [showModal, setShowModal] = useState(true);

  return (
    <div className="flex min-h-screen bg-[#f8fafc] font-sans">
      {/* Sidebar */}
      <aside className="fixed inset-y-0 left-0 w-[260px] bg-gradient-to-b from-[#0a1628] to-[#132744] text-slate-300 flex flex-col z-20">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 bg-gradient-to-br from-[#0ea5e9] to-[#0284c7] rounded flex items-center justify-center shadow-lg">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-[0.15em] text-white">
              ITINIUM
            </h1>
          </div>
          <p className="text-xs text-slate-400 font-medium ml-11">Admin Portal</p>
        </div>

        <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeNav === item.id
                  ? "bg-white/10 text-white border-l-4 border-[#0ea5e9]"
                  : "hover:bg-white/5 hover:text-white border-l-4 border-transparent"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}

          <div className="my-6 border-t border-white/10 mx-4"></div>

          {secondaryNavItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveNav(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                activeNav === item.id
                  ? "bg-white/10 text-white border-l-4 border-[#0ea5e9]"
                  : "hover:bg-white/5 hover:text-white border-l-4 border-transparent"
              }`}
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 px-2 py-2">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-[#0ea5e9] to-[#38bdf8] flex items-center justify-center text-white font-bold text-sm shadow-md">
              SM
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">Sarah Mitchell</p>
              <p className="text-xs text-slate-400 truncate">Administrator</p>
            </div>
            <button className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-md transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-[260px] flex flex-col min-w-0 relative">
        {/* Top Header */}
        <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#0f2744]">User Management</h2>
            <p className="text-sm text-slate-500 mt-1">Manage team members, roles, and access permissions</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-[#0ea5e9]" />
              <Input 
                placeholder="Search users..." 
                className="pl-9 w-[280px] bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
              />
            </div>
            <button className="relative p-2 text-slate-400 hover:text-[#0f2744] hover:bg-slate-100 rounded-full transition-colors hidden sm:block">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
            <Button 
              className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm"
              onClick={() => setShowModal(true)}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add New User
            </Button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-8">
          
          {/* Summary Stats Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-[#0f2744] p-5">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Total Users</p>
                  <h3 className="text-3xl font-bold text-[#0f2744]">24</h3>
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
                  <h3 className="text-3xl font-bold text-[#0f2744]">16</h3>
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
                  <h3 className="text-3xl font-bold text-[#0f2744]">4</h3>
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
                  <h3 className="text-3xl font-bold text-[#0f2744]">4</h3>
                </div>
                <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <Shield className="w-5 h-5 text-indigo-600" />
                </div>
              </div>
            </div>
          </div>

          {/* User List Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Table Header / Filters */}
            <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-[#0f2744]">All Users</h3>
              
              <div className="flex items-center gap-4">
                <div className="flex flex-wrap bg-slate-100 p-1 rounded-lg">
                  {["All", "Depot User", "Team Leader", "Accounts", "Head Office"].map((filter) => (
                    <button
                      key={filter}
                      onClick={() => setActiveFilter(filter)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                        activeFilter === filter
                          ? "bg-white text-[#0f2744] shadow-sm"
                          : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"
                      }`}
                    >
                      {filter}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Table */}
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
                  {mockUsers.map((user, index) => {
                    const roleStyle = getRoleStyles(user.role);
                    return (
                      <tr 
                        key={index} 
                        className={`hover:bg-slate-50/80 transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs ${roleStyle.avatar}`}>
                              {getInitials(user.name)}
                            </div>
                            <div>
                              <div className="font-medium text-[#0f2744]">{user.name}</div>
                              <div className="text-xs text-slate-500">{user.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <Badge 
                            variant="outline" 
                            className={`font-medium shadow-none ${roleStyle.badge}`}
                          >
                            {user.role}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-slate-600">{user.depot}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${user.status === 'Active' ? 'bg-green-500' : 'bg-slate-400'}`}></span>
                            <span className={`font-medium ${user.status === 'Active' ? 'text-slate-700' : 'text-slate-500'}`}>
                              {user.status}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-slate-500">{user.lastActive}</td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-3">
                            <Button 
                              variant="outline" 
                              size="sm" 
                              className="h-7 px-2.5 text-slate-600 border-slate-200 hover:bg-slate-100 hover:text-[#0f2744] transition-colors"
                            >
                              <Edit className="w-3.5 h-3.5 mr-1" />
                              Edit
                            </Button>
                            <button className={`text-xs font-medium hover:underline ${user.status === 'Active' ? 'text-red-600 hover:text-red-700' : 'text-green-600 hover:text-green-700'}`}>
                              {user.status === 'Active' ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
              <span className="text-sm text-slate-500">
                Showing <span className="font-medium text-slate-900">1-10</span> of <span className="font-medium text-slate-900">24</span> users
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8 disabled:opacity-50" disabled>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 bg-[#0ea5e9] text-white border-transparent hover:bg-[#0284c7] hover:text-white">
                  1
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 text-slate-600">
                  2
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 text-slate-600">
                  3
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Add New User Modal Overlay */}
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
                <div className="space-y-4">
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700">Full Name</label>
                    <Input placeholder="e.g. Jane Smith" className="border-slate-200 focus-visible:ring-[#0ea5e9]" />
                  </div>
                  
                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700">Email Address</label>
                    <Input placeholder="jane.smith@example.com" type="email" className="border-slate-200 focus-visible:ring-[#0ea5e9]" />
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700">Role</label>
                    <div className="relative">
                      <select className="w-full appearance-none h-9 rounded-md border border-slate-200 bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#0ea5e9] pr-8">
                        <option value="" disabled selected>Select a role...</option>
                        <option value="depot">Depot User</option>
                        <option value="team_leader">Team Leader</option>
                        <option value="accounts">Accounts</option>
                        <option value="head_office">Head Office</option>
                      </select>
                      <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <label className="text-sm font-medium text-slate-700">
                      Assigned Depot
                      <span className="text-xs text-slate-500 font-normal ml-2">(Required for Depot User and Team Leader roles)</span>
                    </label>
                    <Input placeholder="e.g. Birmingham Central" className="border-slate-200 focus-visible:ring-[#0ea5e9]" />
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
                <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-none shadow-sm">
                  Create User
                </Button>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
