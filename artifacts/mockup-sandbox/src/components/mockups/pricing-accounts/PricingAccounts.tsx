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
  Calendar,
  TrendingUp,
  DollarSign,
  ArrowLeftRight,
  RefreshCw,
  Receipt,
  Search,
  Eye,
  FileDown,
  FileSpreadsheet,
  FileText,
  Info,
  Check,
  Clock,
  ChevronLeft,
  ChevronRight
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
  { id: "JOB-2024-00847", client: "Greenfield Recycling", tonnage: "2.4t", lmeRate: "£1,724.30", value: "£4,138.32", status: "Pending Invoice" },
  { id: "JOB-2024-00846", client: "Metro Waste Solutions", tonnage: "1.8t", lmeRate: "£1,724.30", value: "£3,103.74", status: "Invoiced" },
  { id: "JOB-2024-00845", client: "EcoCollect Ltd", tonnage: "3.1t", lmeRate: "£1,724.30", value: "£5,345.33", status: "Paid" },
  { id: "JOB-2024-00844", client: "National Grid Services", tonnage: "0.9t", lmeRate: "£1,724.30", value: "£1,551.87", status: "Pending Invoice" },
  { id: "JOB-2024-00843", client: "CleanPower UK", tonnage: "4.2t", lmeRate: "£1,724.30", value: "£7,242.06", status: "Invoiced" },
  { id: "JOB-2024-00842", client: "Thames Batteries", tonnage: "1.5t", lmeRate: "£1,698.20", value: "£2,547.30", status: "Paid" },
  { id: "JOB-2024-00841", client: "Northern Energy Co", tonnage: "2.7t", lmeRate: "£1,698.20", value: "£4,585.14", status: "Pending Invoice" },
  { id: "JOB-2024-00840", client: "Severn Trent Recycling", tonnage: "1.1t", lmeRate: "£1,698.20", value: "£1,868.02", status: "Invoiced" },
];

const statusStyles: Record<string, string> = {
  "Pending Invoice": "bg-amber-100 text-amber-800 border-amber-200",
  "Invoiced": "bg-teal-100 text-teal-800 border-teal-200",
  "Paid": "bg-green-100 text-green-800 border-green-200",
};

export function PricingAccounts() {
  const [activeNav, setActiveNav] = useState("lme");
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
              RA
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">Rachel Adams</p>
              <p className="text-xs text-slate-400 truncate">Accounts Manager</p>
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
            <h2 className="text-2xl font-bold text-[#0f2744]">LME Pricing & Accounts</h2>
            <p className="text-sm text-slate-500 mt-1">Manage pricing data and invoice calculations</p>
          </div>
          <div className="flex items-center gap-6">
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
        <div className="flex-1 overflow-auto p-8 space-y-8">
          
          {/* Section 1 - LME Price Input (Manual Fallback) */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3 border-l-4 border-l-[#0ea5e9]">
              <TrendingUp className="w-5 h-5 text-[#0ea5e9]" />
              <h3 className="text-lg font-bold text-[#0f2744]">LME Lead Price — Manual Fallback</h3>
            </div>
            <div className="p-6">
              <div className="bg-sky-50 border border-sky-100 rounded-lg p-3 mb-6 flex items-start gap-3">
                <Info className="w-5 h-5 text-sky-500 mt-0.5" />
                <p className="text-sm text-sky-800">
                  Prices are auto-fetched from the LME API. Use manual override when the feed is unavailable.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Monthly Average LME Lead Price (USD)</label>
                  <div className="relative">
                    <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input 
                      defaultValue="2,185.50" 
                      className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">GBP/USD Exchange Rate</label>
                  <div className="relative">
                    <ArrowLeftRight className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <Input 
                      defaultValue="0.7892" 
                      className="pl-9 bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100 mb-6">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm text-slate-500">Calculated GBP Price per Tonne:</span>
                    <span className="text-lg font-bold text-teal-700 bg-teal-50 px-3 py-1 rounded-md border border-teal-100">£1,724.30</span>
                  </div>
                  <p className="text-xs text-slate-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" /> Last Updated: 15 Mar 2026 14:32
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <Button className="bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-transparent">
                  Update Prices
                </Button>
                <Button variant="outline" className="text-slate-600 border-slate-200 hover:bg-slate-50">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Reset to API Feed
                </Button>
              </div>
            </div>
          </div>

          {/* Section 2 - Accounts Job Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between gap-4 border-l-4 border-l-[#0ea5e9]">
              <div className="flex items-center gap-3">
                <Receipt className="w-5 h-5 text-[#0ea5e9]" />
                <h3 className="text-lg font-bold text-[#0f2744]">Job Value Calculations</h3>
              </div>
            </div>
            
            {/* Filters */}
            <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex flex-wrap gap-2">
                {["All", "Pending Invoice", "Invoiced", "Paid"].map((filter) => (
                  <button
                    key={filter}
                    onClick={() => setActiveFilter(filter)}
                    className={`px-3 py-1.5 text-sm font-medium rounded-full transition-all ${
                      activeFilter === filter
                        ? "bg-[#0f2744] text-white shadow-sm"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {filter}
                  </button>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input 
                  placeholder="Search jobs..." 
                  className="pl-9 h-9 text-sm bg-slate-50 border-slate-200 focus-visible:ring-[#0ea5e9]"
                />
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-4 font-semibold">Job No</th>
                    <th className="px-6 py-4 font-semibold">Client Name</th>
                    <th className="px-6 py-4 font-semibold">Tonnage</th>
                    <th className="px-6 py-4 font-semibold">LME Rate Used</th>
                    <th className="px-6 py-4 font-semibold">Calculated Value (£)</th>
                    <th className="px-6 py-4 font-semibold">Invoice Status</th>
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
                      <td className="px-6 py-4 font-medium text-slate-700">{job.tonnage}</td>
                      <td className="px-6 py-4 text-slate-600">{job.lmeRate}</td>
                      <td className="px-6 py-4 font-medium text-teal-700">{job.value}</td>
                      <td className="px-6 py-4">
                        <Badge 
                          variant="outline" 
                          className={`font-medium ${statusStyles[job.status] || ''}`}
                        >
                          {job.status}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 text-right">
                        {job.status === "Pending Invoice" ? (
                          <Button 
                            size="sm" 
                            className="h-8 bg-[#0ea5e9] hover:bg-[#0284c7] text-white"
                          >
                            <FileDown className="w-3.5 h-3.5 mr-1.5" />
                            Generate Invoice
                          </Button>
                        ) : (
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="h-8 text-[#0ea5e9] border-[#0ea5e9]/30 hover:bg-[#0ea5e9] hover:text-white transition-colors"
                          >
                            <Eye className="w-3.5 h-3.5 mr-1.5" />
                            View Invoice
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="px-6 py-4 border-t border-slate-200 flex items-center justify-between bg-slate-50/50">
              <span className="text-sm text-slate-500">
                Showing <span className="font-medium text-slate-900">1-8</span> of <span className="font-medium text-slate-900">34</span> results
              </span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8 disabled:opacity-50" disabled>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" className="h-8 w-8 bg-[#0f2744] text-white border-transparent hover:bg-[#1e3a5f] hover:text-white">
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
                  5
                </Button>
                <Button variant="outline" size="icon" className="h-8 w-8">
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {/* Section 3 - Export Controls */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center gap-3 border-l-4 border-l-[#0ea5e9]">
              <FileDown className="w-5 h-5 text-[#0ea5e9]" />
              <h3 className="text-lg font-bold text-[#0f2744]">Export & Reports</h3>
            </div>
            
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Card A */}
              <div className="border border-slate-200 rounded-xl p-6 flex flex-col text-center hover:shadow-md transition-shadow bg-white">
                <div className="w-12 h-12 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileSpreadsheet className="w-6 h-6 text-green-600" />
                </div>
                <h4 className="font-bold text-[#0f2744] mb-2">Accounts Excel File</h4>
                <p className="text-sm text-slate-500 mb-6 flex-1">
                  Full job listing with calculated values for client invoicing
                </p>
                <Button className="w-full bg-green-600 hover:bg-green-700 text-white border-transparent shadow-sm">
                  Download .xlsx
                </Button>
              </div>

              {/* Card B */}
              <div className="border border-slate-200 rounded-xl p-6 flex flex-col text-center hover:shadow-md transition-shadow bg-white">
                <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <FileText className="w-6 h-6 text-teal-600" />
                </div>
                <h4 className="font-bold text-[#0f2744] mb-2">Invoice Summary PDF</h4>
                <p className="text-sm text-slate-500 mb-6 flex-1">
                  Monthly invoice summary report for management review
                </p>
                <Button className="w-full bg-[#0ea5e9] hover:bg-[#0284c7] text-white border-transparent shadow-sm">
                  Download .pdf
                </Button>
              </div>

              {/* Card C */}
              <div className="border border-slate-200 rounded-xl p-6 flex flex-col text-center hover:shadow-md transition-shadow bg-white">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <BarChart3 className="w-6 h-6 text-slate-600" />
                </div>
                <h4 className="font-bold text-[#0f2744] mb-2">LME Price History</h4>
                <p className="text-sm text-slate-500 mb-6 flex-1">
                  Historical LME pricing data and exchange rates
                </p>
                <Button className="w-full bg-[#0f2744] hover:bg-[#1e3a5f] text-white border-transparent shadow-sm">
                  Download .csv
                </Button>
              </div>
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
