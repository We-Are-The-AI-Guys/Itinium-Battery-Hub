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
  Search,
  Bell,
  Clock,
  Scale,
  Receipt,
  AlertTriangle,
  Eye,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  ArrowUpRight,
  Filter,
  Calendar,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

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

const mockJobs = [
  { id: "JOB-2024-00847", client: "Greenfield Recycling", depot: "Birmingham Central", date: "15 Mar 2026", tonnage: "2.4t", status: "Pending" },
  { id: "JOB-2024-00846", client: "Metro Waste Solutions", depot: "Manchester North", date: "14 Mar 2026", tonnage: "1.8t", status: "Approved" },
  { id: "JOB-2024-00845", client: "EcoCollect Ltd", depot: "Leeds Hub", date: "14 Mar 2026", tonnage: "3.1t", status: "Completed" },
  { id: "JOB-2024-00844", client: "National Grid Services", depot: "London Depot", date: "13 Mar 2026", tonnage: "0.9t", status: "Pending" },
  { id: "JOB-2024-00843", client: "CleanPower UK", depot: "Bristol South", date: "13 Mar 2026", tonnage: "4.2t", status: "Approved" },
  { id: "JOB-2024-00842", client: "Thames Batteries", depot: "Reading Central", date: "12 Mar 2026", tonnage: "1.5t", status: "Completed" },
  { id: "JOB-2024-00841", client: "Northern Energy Co", depot: "Sheffield East", date: "12 Mar 2026", tonnage: "2.7t", status: "Pending" },
  { id: "JOB-2024-00840", client: "Severn Trent Recycling", depot: "Coventry West", date: "11 Mar 2026", tonnage: "1.1t", status: "Flagged" },
];

const statusStyles: Record<string, string> = {
  Pending: "bg-amber-100 text-amber-800 border-amber-200",
  Approved: "bg-teal-100 text-teal-800 border-teal-200",
  Completed: "bg-green-100 text-green-800 border-green-200",
  Flagged: "bg-red-100 text-red-800 border-red-200",
};

export function AdminDashboard() {
  const [activeNav, setActiveNav] = useState("dashboard");
  const [activeFilter, setActiveFilter] = useState("All");

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
      <main className="flex-1 ml-[260px] flex flex-col min-w-0">
        {/* Top Header */}
        <header className="sticky top-0 z-10 bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-[#0f2744]">Dashboard</h2>
            <p className="text-sm text-slate-500 mt-1">Overview of all operations</p>
          </div>
          <div className="flex items-center gap-6">
            <div className="relative group">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 group-focus-within:text-[#0ea5e9]" />
              <Input 
                placeholder="Search jobs, clients..." 
                className="pl-9 w-[280px] bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md text-sm font-medium text-slate-600">
              <Calendar className="w-4 h-4 text-slate-400" />
              Mar 2026
            </div>
            <button className="relative p-2 text-slate-400 hover:text-[#0f2744] hover:bg-slate-100 rounded-full transition-colors">
              <Bell className="w-5 h-5" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full border border-white"></span>
            </button>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-auto p-8">
          
          {/* Metric Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-8">
            {/* Card 1 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-amber-500 p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Total Pending Jobs</p>
                  <h3 className="text-3xl font-bold text-[#0f2744]">47</h3>
                </div>
                <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-amber-500" />
                </div>
              </div>
              <div className="flex items-center text-sm">
                <TrendingUp className="w-4 h-4 text-amber-600 mr-1" />
                <span className="text-amber-600 font-medium">+12 this week</span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-teal-500 p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Current Tonnage (Monthly)</p>
                  <h3 className="text-3xl font-bold text-[#0f2744]">68.4t</h3>
                </div>
                <div className="w-10 h-10 rounded-lg bg-teal-50 flex items-center justify-center">
                  <Scale className="w-5 h-5 text-teal-500" />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500 font-medium">of 100t target</span>
                  <span className="text-teal-600 font-bold">68%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-teal-500 w-[68%] rounded-full"></div>
                </div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-green-500 p-5 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Total Invoice Value</p>
                  <h3 className="text-3xl font-bold text-[#0f2744]">£142,850</h3>
                </div>
                <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
                  <Receipt className="w-5 h-5 text-green-500" />
                </div>
              </div>
              <div className="flex items-center text-sm">
                <ArrowUpRight className="w-4 h-4 text-green-600 mr-1" />
                <span className="text-green-600 font-medium">+8.2% vs last month</span>
              </div>
            </div>

            {/* Card 4 */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-red-500 p-5 hover:shadow-md transition-shadow relative overflow-hidden">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <p className="text-sm font-medium text-slate-500 mb-1">Flagged Exceptions</p>
                  <h3 className="text-3xl font-bold text-[#0f2744]">5</h3>
                </div>
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <AlertTriangle className="w-5 h-5 text-red-500" />
                </div>
              </div>
              <div className="flex items-center text-sm">
                <span className="w-2 h-2 rounded-full bg-red-500 mr-2"></span>
                <span className="text-red-600 font-medium">2 critical exceptions</span>
              </div>
            </div>
          </div>

          {/* Main Table Section */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Table Header / Filters */}
            <div className="px-6 py-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-lg font-bold text-[#0f2744]">Recent Jobs</h3>
              
              <div className="flex items-center gap-4">
                <div className="flex bg-slate-100 p-1 rounded-lg">
                  {["All", "Pending", "Approved", "Completed"].map((filter) => (
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
                <Button variant="outline" size="sm" className="h-8 text-[#0ea5e9] border-[#0ea5e9]/20 hover:bg-[#0ea5e9]/10">
                  View All
                  <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Job ID</th>
                    <th className="px-6 py-4 font-semibold">Client Name</th>
                    <th className="px-6 py-4 font-semibold">Depot</th>
                    <th className="px-6 py-4 font-semibold">Date Submitted</th>
                    <th className="px-6 py-4 font-semibold">Tonnage</th>
                    <th className="px-6 py-4 font-semibold">Status</th>
                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {mockJobs.map((job, index) => (
                    <tr 
                      key={job.id} 
                      className={`hover:bg-slate-50/80 transition-colors group ${index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}`}
                    >
                      <td className="px-6 py-4 font-medium text-[#0f2744]">{job.id}</td>
                      <td className="px-6 py-4 text-slate-700">{job.client}</td>
                      <td className="px-6 py-4 text-slate-600">{job.depot}</td>
                      <td className="px-6 py-4 text-slate-600">{job.date}</td>
                      <td className="px-6 py-4 font-medium text-slate-700">{job.tonnage}</td>
                      <td className="px-6 py-4">
                        <Badge 
                          variant="outline" 
                          className={`font-medium ${statusStyles[job.status] || ''}`}
                        >
                          {job.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-[#0ea5e9] border-[#0ea5e9]/30 hover:bg-[#0ea5e9] hover:text-white transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1.5" />
                          Review
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
              <span className="text-sm text-slate-500">
                Showing <span className="font-medium text-slate-900">1-8</span> of <span className="font-medium text-slate-900">47</span> results
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
                <span className="px-2 py-1 text-slate-400">...</span>
                <Button variant="outline" size="sm" className="h-8 w-8 text-slate-600">
                  6
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
