import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, CalendarDays, Calendar } from "lucide-react";
import { SidebarLayout } from "@/components/sidebar-layout";
import { Button } from "@/components/ui/button";

interface ScheduleJob {
  id: number;
  reference: string;
  clientName: string;
  depot: string;
  collectionDate: string;
  status: string;
}

type ViewMode = "month" | "week";

const STATUS_COLOUR: Record<string, { bg: string; text: string; border: string }> = {
  request:          { bg: "bg-amber-100",  text: "text-amber-800",  border: "border-amber-300" },
  confirmed:        { bg: "bg-blue-100",   text: "text-blue-800",   border: "border-blue-300"  },
  received:         { bg: "bg-green-100",  text: "text-green-800",  border: "border-green-300" },
  awaiting_invoice: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300"},
  invoice:          { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300"},
  completed:        { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-300"},
};

const STATUS_LABEL: Record<string, string> = {
  request:          "Pending",
  confirmed:        "Confirmed",
  received:         "In Progress",
  awaiting_invoice: "Invoiced",
  invoice:          "Invoiced",
  completed:        "Closed",
};

const DOT_COLOUR: Record<string, string> = {
  request:          "bg-amber-500",
  confirmed:        "bg-blue-500",
  received:         "bg-green-500",
  awaiting_invoice: "bg-purple-500",
  invoice:          "bg-purple-500",
  completed:        "bg-purple-500",
};

const DAYS_OF_WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getColour(status: string) {
  return STATUS_COLOUR[status] ?? { bg: "bg-slate-100", text: "text-slate-700", border: "border-slate-200" };
}

function getDot(status: string) {
  return DOT_COLOUR[status] ?? "bg-slate-400";
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  const result = new Date(d);
  result.setDate(d.getDate() + diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(d.getDate() + n);
  return result;
}

function formatMonthYear(d: Date): string {
  return d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function formatWeekRange(start: Date): string {
  const end = addDays(start, 6);
  if (start.getMonth() === end.getMonth()) {
    return `${start.getDate()}–${end.getDate()} ${start.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}`;
  }
  return `${start.toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${end.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
}

function JobBlock({ job, onClick }: { job: ScheduleJob; onClick: () => void }) {
  const colour = getColour(job.status);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left rounded px-1.5 py-1 border text-xs leading-tight truncate cursor-pointer hover:brightness-95 transition-all ${colour.bg} ${colour.text} ${colour.border}`}
      title={`${job.reference} — ${job.clientName} / ${job.depot}`}
    >
      <span className="font-semibold block truncate">{job.clientName}</span>
      <span className="opacity-75 block truncate">{job.depot}</span>
    </button>
  );
}

function Legend() {
  const items = [
    { label: "Pending",    dot: "bg-amber-500"  },
    { label: "Confirmed",  dot: "bg-blue-500"   },
    { label: "In Progress",dot: "bg-green-500"  },
    { label: "Invoiced / Closed", dot: "bg-purple-500" },
  ];
  return (
    <div className="flex items-center gap-4 flex-wrap">
      {items.map(({ label, dot }) => (
        <div key={label} className="flex items-center gap-1.5 text-xs text-slate-500">
          <span className={`w-2.5 h-2.5 rounded-full ${dot} shrink-0`} />
          {label}
        </div>
      ))}
    </div>
  );
}

function MonthView({
  anchor,
  jobsByDate,
  onJobClick,
}: {
  anchor: Date;
  jobsByDate: Map<string, ScheduleJob[]>;
  onJobClick: (id: number) => void;
}) {
  const today = isoDate(new Date());
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const firstOfMonth = new Date(year, month, 1);
  const lastOfMonth = new Date(year, month + 1, 0);

  const gridStart = startOfWeek(firstOfMonth);
  const totalCells = Math.ceil(((lastOfMonth.getDate() - 1 + ((firstOfMonth.getDay() + 6) % 7)) + 1) / 7) * 7;
  const days = Array.from({ length: totalCells }, (_, i) => addDays(gridStart, i));

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-7 border-b border-slate-200">
        {DAYS_OF_WEEK.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-slate-500 py-2 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 flex-1" style={{ gridAutoRows: "minmax(100px, 1fr)" }}>
        {days.map((day) => {
          const key = isoDate(day);
          const isCurrentMonth = day.getMonth() === month;
          const isToday = key === today;
          const jobs = jobsByDate.get(key) ?? [];

          return (
            <div
              key={key}
              className={`border-b border-r border-slate-200 p-1.5 flex flex-col gap-1 min-h-[100px] ${
                isCurrentMonth ? "bg-white" : "bg-slate-50"
              }`}
            >
              <span
                className={`text-xs font-medium self-start w-6 h-6 flex items-center justify-center rounded-full ${
                  isToday
                    ? "bg-[#0ea5e9] text-white"
                    : isCurrentMonth
                    ? "text-slate-700"
                    : "text-slate-300"
                }`}
              >
                {day.getDate()}
              </span>
              {jobs.map((job) => (
                <JobBlock key={job.id} job={job} onClick={() => onJobClick(job.id)} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WeekView({
  anchor,
  jobsByDate,
  onJobClick,
}: {
  anchor: Date;
  jobsByDate: Map<string, ScheduleJob[]>;
  onJobClick: (id: number) => void;
}) {
  const today = isoDate(new Date());
  const weekStart = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="flex-1 overflow-auto">
      <div className="grid grid-cols-7 border-b border-slate-200">
        {days.map((day) => {
          const key = isoDate(day);
          const isToday = key === today;
          return (
            <div key={key} className="text-center py-3 border-r border-slate-200 last:border-r-0">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                {day.toLocaleDateString("en-GB", { weekday: "short" })}
              </p>
              <span
                className={`mx-auto mt-1 w-8 h-8 flex items-center justify-center rounded-full text-sm font-semibold ${
                  isToday ? "bg-[#0ea5e9] text-white" : "text-slate-700"
                }`}
              >
                {day.getDate()}
              </span>
              <p className="text-xs text-slate-400 mt-0.5">
                {day.toLocaleDateString("en-GB", { month: "short" })}
              </p>
            </div>
          );
        })}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const key = isoDate(day);
          const jobs = jobsByDate.get(key) ?? [];
          return (
            <div
              key={key}
              className="border-r border-slate-200 last:border-r-0 p-2 flex flex-col gap-1.5 min-h-[400px] bg-white"
            >
              {jobs.length === 0 ? (
                <p className="text-xs text-slate-300 text-center mt-4">—</p>
              ) : (
                jobs.map((job) => (
                  <JobBlock key={job.id} job={job} onClick={() => onJobClick(job.id)} />
                ))
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SchedulePage() {
  const [, navigate] = useLocation();
  const [view, setView] = useState<ViewMode>("month");
  const [anchor, setAnchor] = useState<Date>(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  });
  const [jobs, setJobs] = useState<ScheduleJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch("/api/jobs/schedule", { credentials: "include" })
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load schedule data");
        return r.json();
      })
      .then((data) => {
        setJobs(data.jobs ?? []);
        setError(null);
      })
      .catch(() => setError("Could not load schedule data. Please try again."))
      .finally(() => setLoading(false));
  }, []);

  const jobsByDate = new Map<string, ScheduleJob[]>();
  for (const job of jobs) {
    if (!job.collectionDate) continue;
    const key = job.collectionDate.slice(0, 10);
    if (!jobsByDate.has(key)) jobsByDate.set(key, []);
    jobsByDate.get(key)!.push(job);
  }

  function navigate_prev() {
    if (view === "month") {
      setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1));
    } else {
      setAnchor((a) => addDays(a, -7));
    }
  }

  function navigate_next() {
    if (view === "month") {
      setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1));
    } else {
      setAnchor((a) => addDays(a, 7));
    }
  }

  function goToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setAnchor(d);
  }

  const title = view === "month" ? formatMonthYear(anchor) : formatWeekRange(startOfWeek(anchor));

  const totalJobs = jobs.length;
  const withDate = jobs.length;

  return (
    <SidebarLayout>
      <div className="flex flex-col h-full -m-8">
        {/* Page header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white shrink-0">
          <div>
            <h1 className="text-xl font-bold text-[#0f2744]">Schedule</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {loading ? "Loading…" : `${withDate} job${withDate === 1 ? "" : "s"} with collection dates`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Legend />
            {/* View toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setView("month")}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  view === "month"
                    ? "bg-[#0f2744] text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Calendar className="w-4 h-4" />
                Month
              </button>
              <button
                onClick={() => setView("week")}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${
                  view === "week"
                    ? "bg-[#0f2744] text-white"
                    : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                Week
              </button>
            </div>
          </div>
        </div>

        {/* Calendar navigation */}
        <div className="flex items-center gap-3 px-8 py-3 border-b border-slate-200 bg-white shrink-0">
          <button
            onClick={navigate_prev}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-sm font-medium text-slate-600 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors"
          >
            Today
          </button>
          <button
            onClick={navigate_next}
            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <h2 className="text-base font-semibold text-[#0f2744] ml-1">{title}</h2>
        </div>

        {/* Calendar body */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-center gap-3 text-slate-400">
              <div className="w-5 h-5 border-2 border-[#0ea5e9] border-t-transparent rounded-full animate-spin" />
              Loading schedule…
            </div>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        ) : view === "month" ? (
          <MonthView
            anchor={anchor}
            jobsByDate={jobsByDate}
            onJobClick={(id) => navigate(`/jobs/${id}`)}
          />
        ) : (
          <WeekView
            anchor={anchor}
            jobsByDate={jobsByDate}
            onJobClick={(id) => navigate(`/jobs/${id}`)}
          />
        )}
      </div>
    </SidebarLayout>
  );
}
