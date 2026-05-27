import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { ChevronLeft, ChevronRight, CalendarDays, Calendar, GanttChartSquare, Paintbrush } from "lucide-react";
import { SidebarLayout } from "@/components/sidebar-layout";

interface ScheduleJob {
  id: number;
  reference: string;
  clientName: string;
  depot: string;
  collectionDate: string;
  status: string;
}

type ViewMode = "month" | "week" | "gantt";

// ─── Status colour maps ───────────────────────────────────────────────────────

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

const STATUS_BORDER_HEX: Record<string, string> = {
  request:          "#f59e0b",
  confirmed:        "#3b82f6",
  received:         "#22c55e",
  awaiting_invoice: "#a855f7",
  invoice:          "#a855f7",
  completed:        "#a855f7",
};

// ─── Gantt constants ──────────────────────────────────────────────────────────

const GANTT_SIDEBAR_W = 196;
const GANTT_DAY_W     = 44;
const GANTT_ROW_H     = 34;
const GANTT_HEADER_H  = 52;
const GANTT_PAD_DAYS  = 14;
const GANTT_FUTURE    = 30;

const SITE_PALETTE = [
  "#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6",
  "#14b8a6", "#f97316", "#84cc16", "#ec4899", "#06b6d4", "#e11d48",
];

const LS_COLOURS_KEY = "itinium_gantt_site_colours";

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
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

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function loadSiteColours(): Record<string, string> {
  try {
    const raw = localStorage.getItem(LS_COLOURS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSiteColours(colours: Record<string, string>) {
  try {
    localStorage.setItem(LS_COLOURS_KEY, JSON.stringify(colours));
  } catch {}
}

// Assign a row index to each job within its depot so same-day jobs don't overlap
function packJobs(jobs: ScheduleJob[]): Array<ScheduleJob & { row: number }> {
  const sorted = [...jobs].sort((a, b) => a.collectionDate.localeCompare(b.collectionDate));
  const lastDateInRow: string[] = [];
  return sorted.map((job) => {
    const date = job.collectionDate.slice(0, 10);
    let assigned = -1;
    for (let r = 0; r < lastDateInRow.length; r++) {
      if (lastDateInRow[r] !== date) {
        assigned = r;
        lastDateInRow[r] = date;
        break;
      }
    }
    if (assigned === -1) {
      assigned = lastDateInRow.length;
      lastDateInRow.push(date);
    }
    return { ...job, row: assigned };
  });
}

// ─── Shared sub-components ───────────────────────────────────────────────────

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

function StatusLegend() {
  const items = [
    { label: "Pending",           dot: "bg-amber-500"  },
    { label: "Confirmed",         dot: "bg-blue-500"   },
    { label: "In Progress",       dot: "bg-green-500"  },
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

// ─── Month view ───────────────────────────────────────────────────────────────

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
                  isToday ? "bg-[#0ea5e9] text-white" : isCurrentMonth ? "text-slate-700" : "text-slate-300"
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

// ─── Week view ────────────────────────────────────────────────────────────────

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

// ─── Gantt view ───────────────────────────────────────────────────────────────

function GanttView({
  jobs,
  onJobClick,
}: {
  jobs: ScheduleJob[];
  onJobClick: (id: number) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [siteColours, setSiteColours] = useState<Record<string, string>>(loadSiteColours);

  // Compute timeline bounds
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let minDate = today;
  let maxDate = today;

  for (const job of jobs) {
    if (!job.collectionDate) continue;
    const d = new Date(job.collectionDate + "T00:00:00");
    if (d < minDate) minDate = d;
    if (d > maxDate) maxDate = d;
  }

  const timelineStart = addDays(minDate, -GANTT_PAD_DAYS);
  const timelineEnd   = addDays(maxDate,  GANTT_FUTURE);
  const totalDays     = daysBetween(timelineStart, timelineEnd) + 1;

  // Auto-scroll to today on mount
  useEffect(() => {
    if (!scrollRef.current) return;
    const todayOffset = daysBetween(timelineStart, today) * GANTT_DAY_W;
    scrollRef.current.scrollLeft = Math.max(0, todayOffset - scrollRef.current.clientWidth * 0.3);
  }, []);

  // Assign colours to sites
  const allDepots = Array.from(new Set(jobs.map((j) => j.depot))).sort();
  const colours = { ...siteColours };
  let paletteIdx = Object.keys(colours).length % SITE_PALETTE.length;
  for (const depot of allDepots) {
    if (!colours[depot]) {
      colours[depot] = SITE_PALETTE[paletteIdx % SITE_PALETTE.length];
      paletteIdx++;
    }
  }

  const updateColour = useCallback((depot: string, hex: string) => {
    setSiteColours((prev) => {
      const next = { ...prev, [depot]: hex };
      saveSiteColours(next);
      return next;
    });
  }, []);

  // Group and pack jobs by depot, sorted by total job count desc
  const depotsWithJobs = allDepots
    .map((depot) => ({
      depot,
      packed: packJobs(jobs.filter((j) => j.depot === depot)),
    }))
    .sort((a, b) => b.packed.length - a.packed.length);

  // Month header segments
  const monthSegments: Array<{ label: string; days: number; startDay: number }> = [];
  let cur = new Date(timelineStart);
  let segStart = 0;
  while (cur <= timelineEnd) {
    const monthLabel = cur.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
    const firstOfNextMonth = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    const endOfSeg = firstOfNextMonth <= timelineEnd ? firstOfNextMonth : addDays(timelineEnd, 1);
    const segDays = daysBetween(cur, endOfSeg);
    monthSegments.push({ label: monthLabel, days: segDays, startDay: segStart });
    segStart += segDays;
    cur = firstOfNextMonth;
  }

  const todayOffset = daysBetween(timelineStart, today);
  const totalGridW  = totalDays * GANTT_DAY_W;

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Left sticky sidebar */}
      <div
        className="shrink-0 bg-white border-r border-slate-200 z-10 flex flex-col"
        style={{ width: GANTT_SIDEBAR_W }}
      >
        {/* Header spacer */}
        <div
          className="border-b border-slate-200 bg-slate-50 flex items-end px-3 pb-2"
          style={{ height: GANTT_HEADER_H }}
        >
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Site</span>
        </div>

        {/* Site rows */}
        <div className="overflow-y-auto flex-1">
          {depotsWithJobs.map(({ depot, packed }) => {
            const numRows = Math.max(1, ...packed.map((j) => j.row + 1));
            const rowH = numRows * GANTT_ROW_H + 8;
            const siteHex = colours[depot] ?? "#6366f1";
            const colourInputId = `gc-${depot.replace(/\s+/g, "-")}`;
            return (
              <div
                key={depot}
                className="border-b border-slate-100 flex items-start px-3 gap-2 group"
                style={{ minHeight: rowH }}
              >
                {/* Colour swatch */}
                <div className="relative mt-2 shrink-0">
                  <label
                    htmlFor={colourInputId}
                    className="block w-4 h-4 rounded cursor-pointer ring-1 ring-slate-300 hover:ring-2 hover:ring-slate-400 transition-all"
                    style={{ backgroundColor: siteHex }}
                    title="Click to change site colour"
                  />
                  <input
                    id={colourInputId}
                    type="color"
                    value={siteHex}
                    onChange={(e) => updateColour(depot, e.target.value)}
                    className="absolute opacity-0 w-0 h-0 pointer-events-none"
                  />
                </div>
                <div className="flex-1 min-w-0 mt-2">
                  <p className="text-xs font-semibold text-[#0f2744] truncate leading-tight">{depot}</p>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    {packed.length} job{packed.length === 1 ? "" : "s"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Scrollable timeline */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-x-auto overflow-y-auto"
        style={{ scrollBehavior: "auto" }}
      >
        <div style={{ width: totalGridW, minWidth: totalGridW }}>
          {/* Month header row */}
          <div
            className="flex border-b border-slate-200 bg-slate-50 sticky top-0 z-10"
            style={{ height: GANTT_HEADER_H / 2 }}
          >
            {monthSegments.map((seg) => (
              <div
                key={seg.startDay}
                className="border-r border-slate-200 flex items-center px-2 shrink-0"
                style={{ width: seg.days * GANTT_DAY_W }}
              >
                <span className="text-xs font-semibold text-slate-600 truncate">{seg.label}</span>
              </div>
            ))}
          </div>

          {/* Day header row */}
          <div
            className="flex border-b border-slate-200 bg-slate-50 sticky z-10"
            style={{ top: GANTT_HEADER_H / 2, height: GANTT_HEADER_H / 2 }}
          >
            {Array.from({ length: totalDays }, (_, i) => {
              const d = addDays(timelineStart, i);
              const isToday = i === todayOffset;
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return (
                <div
                  key={i}
                  className={`shrink-0 border-r border-slate-100 flex flex-col items-center justify-center ${
                    isToday ? "bg-sky-50" : isWeekend ? "bg-slate-50" : "bg-white"
                  }`}
                  style={{ width: GANTT_DAY_W }}
                >
                  <span
                    className={`text-[10px] font-medium leading-none ${
                      isToday ? "text-[#0ea5e9]" : isWeekend ? "text-slate-300" : "text-slate-400"
                    }`}
                  >
                    {d.toLocaleDateString("en-GB", { weekday: "narrow" })}
                  </span>
                  <span
                    className={`text-xs font-semibold mt-0.5 w-5 h-5 flex items-center justify-center rounded-full ${
                      isToday ? "bg-[#0ea5e9] text-white" : isWeekend ? "text-slate-300" : "text-slate-600"
                    }`}
                  >
                    {d.getDate()}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Grid body */}
          <div className="relative" style={{ width: totalGridW }}>
            {/* Today vertical line */}
            {todayOffset >= 0 && todayOffset < totalDays && (
              <div
                className="absolute top-0 bottom-0 w-px bg-sky-400 z-20 pointer-events-none"
                style={{ left: todayOffset * GANTT_DAY_W + GANTT_DAY_W / 2 }}
              />
            )}

            {/* Weekend column shading */}
            {Array.from({ length: totalDays }, (_, i) => {
              const d = addDays(timelineStart, i);
              const isWeekend = d.getDay() === 0 || d.getDay() === 6;
              return isWeekend ? (
                <div
                  key={i}
                  className="absolute top-0 bottom-0 bg-slate-50 pointer-events-none"
                  style={{ left: i * GANTT_DAY_W, width: GANTT_DAY_W }}
                />
              ) : null;
            })}

            {/* Site rows */}
            {depotsWithJobs.map(({ depot, packed }) => {
              const numRows = Math.max(1, ...packed.map((j) => j.row + 1));
              const rowH = numRows * GANTT_ROW_H + 8;
              const siteHex = colours[depot] ?? "#6366f1";

              return (
                <div
                  key={depot}
                  className="relative border-b border-slate-100"
                  style={{ minHeight: rowH }}
                >
                  {/* Horizontal grid lines */}
                  {Array.from({ length: totalDays }, (_, i) => (
                    <div
                      key={i}
                      className="absolute top-0 bottom-0 border-r border-slate-100 pointer-events-none"
                      style={{ left: i * GANTT_DAY_W, width: GANTT_DAY_W }}
                    />
                  ))}

                  {/* Job bars */}
                  {packed.map((job) => {
                    const jobDate = new Date(job.collectionDate + "T00:00:00");
                    const dayIndex = daysBetween(timelineStart, jobDate);
                    if (dayIndex < 0 || dayIndex >= totalDays) return null;

                    const left   = dayIndex * GANTT_DAY_W + 2;
                    const top    = 4 + job.row * GANTT_ROW_H;
                    const width  = GANTT_DAY_W - 4;
                    const height = GANTT_ROW_H - 6;
                    const statusBorder = STATUS_BORDER_HEX[job.status] ?? "#94a3b8";

                    return (
                      <button
                        key={job.id}
                        onClick={() => onJobClick(job.id)}
                        className="absolute rounded overflow-hidden text-left cursor-pointer hover:brightness-90 transition-all"
                        style={{
                          left,
                          top,
                          width,
                          height,
                          backgroundColor: hexToRgba(siteHex, 0.18),
                          border: `1px solid ${hexToRgba(siteHex, 0.5)}`,
                          borderLeft: `4px solid ${statusBorder}`,
                        }}
                        title={`${job.reference} — ${job.clientName}\n${STATUS_LABEL[job.status] ?? job.status} · ${job.collectionDate}`}
                      >
                        <span
                          className="block px-1 text-[10px] font-semibold leading-tight truncate"
                          style={{ color: siteHex, filter: "brightness(0.7)" }}
                        >
                          {job.clientName}
                        </span>
                        <span className="block px-1 text-[10px] text-slate-500 leading-tight truncate">
                          {job.reference}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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

  function nav_prev() {
    if (view === "month") setAnchor((a) => new Date(a.getFullYear(), a.getMonth() - 1, 1));
    else setAnchor((a) => addDays(a, -7));
  }

  function nav_next() {
    if (view === "month") setAnchor((a) => new Date(a.getFullYear(), a.getMonth() + 1, 1));
    else setAnchor((a) => addDays(a, 7));
  }

  function goToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    setAnchor(d);
  }

  const calendarTitle = view === "month" ? formatMonthYear(anchor) : formatWeekRange(startOfWeek(anchor));
  const withDate = jobs.length;

  return (
    <SidebarLayout>
      <div className="flex flex-col h-full -m-8">
        {/* Page header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-slate-200 bg-white shrink-0">
          <div>
            <h1 className="text-xl font-bold text-[#0f2744]">Schedule</h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {loading
                ? "Loading…"
                : view === "gantt"
                ? `${withDate} job${withDate === 1 ? "" : "s"} · click the colour swatch beside each site to customise`
                : `${withDate} job${withDate === 1 ? "" : "s"} with collection dates`}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {view !== "gantt" && <StatusLegend />}

            {/* View toggle */}
            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
              <button
                onClick={() => setView("month")}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors ${
                  view === "month" ? "bg-[#0f2744] text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Calendar className="w-4 h-4" />
                Month
              </button>
              <button
                onClick={() => setView("week")}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${
                  view === "week" ? "bg-[#0f2744] text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <CalendarDays className="w-4 h-4" />
                Week
              </button>
              <button
                onClick={() => setView("gantt")}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${
                  view === "gantt" ? "bg-[#0f2744] text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <GanttChartSquare className="w-4 h-4" />
                Gantt
              </button>
            </div>
          </div>
        </div>

        {/* Calendar navigation — hidden in Gantt mode */}
        {view !== "gantt" && (
          <div className="flex items-center gap-3 px-8 py-3 border-b border-slate-200 bg-white shrink-0">
            <button
              onClick={nav_prev}
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
              onClick={nav_next}
              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <h2 className="text-base font-semibold text-[#0f2744] ml-1">{calendarTitle}</h2>
          </div>
        )}

        {/* Body */}
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
        ) : view === "week" ? (
          <WeekView
            anchor={anchor}
            jobsByDate={jobsByDate}
            onJobClick={(id) => navigate(`/jobs/${id}`)}
          />
        ) : (
          <GanttView
            jobs={jobs}
            onJobClick={(id) => navigate(`/jobs/${id}`)}
          />
        )}
      </div>
    </SidebarLayout>
  );
}
