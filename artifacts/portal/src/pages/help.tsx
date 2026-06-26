import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { SidebarLayout } from "@/components/sidebar-layout";
import {
  BookOpen,
  Upload,
  Package,
  LayoutDashboard,
  Briefcase,
  BarChart3,
  LineChart,
  Building2,
  CalendarDays,
  Users,
  Settings,
  Lightbulb,
  ChevronRight,
  CheckCircle2,
  Info,
  ClipboardList,
  MapPin,
} from "lucide-react";

function StepList({ steps }: { steps: React.ReactNode[] }) {
  return (
    <ol className="space-y-2 mt-3">
      {steps.map((step, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className="flex-shrink-0 w-6 h-6 rounded-full bg-[#0ea5e9] text-white text-xs font-bold flex items-center justify-center mt-0.5">
            {i + 1}
          </span>
          <span className="text-slate-600 text-sm leading-relaxed">{step}</span>
        </li>
      ))}
    </ol>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 bg-sky-50 border border-sky-200 rounded-lg p-4 mt-4">
      <Lightbulb className="w-4 h-4 text-sky-500 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-sky-800 leading-relaxed">{children}</p>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4 mt-4">
      <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-amber-800 leading-relaxed">{children}</p>
    </div>
  );
}

function Success({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 bg-emerald-50 border border-emerald-200 rounded-lg p-4 mt-4">
      <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
      <p className="text-sm text-emerald-800 leading-relaxed">{children}</p>
    </div>
  );
}

function H2({ children }: { children: React.ReactNode }) {
  return <h3 className="text-base font-semibold text-[#0f2744] mt-6 mb-2 first:mt-0">{children}</h3>;
}

function Body({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-600 leading-relaxed">{children}</p>;
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="space-y-1.5 mt-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-sm text-slate-600 leading-relaxed">
          <ChevronRight className="w-3.5 h-3.5 text-[#0ea5e9] flex-shrink-0 mt-1" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

interface Section {
  id: string;
  title: string;
  icon: typeof BookOpen;
  roles: string[] | "all";
  content: React.ReactNode;
}

function buildSections(): Section[] {
  return [
    {
      id: "getting-started",
      title: "Getting Started",
      icon: BookOpen,
      roles: "all",
      content: (
        <>
          <H2>Logging in</H2>
          <Body>
            Open the portal in your browser and enter your email address and password. If you have forgotten your
            password, click <strong>Forgot password?</strong> on the login page — a reset link will be sent to your
            email within a few minutes.
          </Body>
          <H2>Navigation overview</H2>
          <Body>
            The dark sidebar on the left is your main navigation. Items shown depend on your role — you will only see
            the sections you have access to. At the bottom of the sidebar you will find your name, role, and a
            sign-out button.
          </Body>
          <BulletList items={[
            <><strong>New Collection</strong> — submit a battery collection at any time from the sidebar.</>,
            <><strong>User Guide</strong> — this page.</>,
            <><strong>Settings</strong> — update your profile, display name, or password.</>,
            <><strong>Help &amp; Support</strong> — submit a support ticket directly to the Itinium team.</>,
          ]} />
          <Note>
            If you believe you are missing access to a section you need, contact your administrator or use the
            Help &amp; Support button to raise a ticket.
          </Note>
        </>
      ),
    },
    {
      id: "new-collection",
      title: "New Collection",
      icon: Upload,
      roles: "all",
      content: (
        <>
          <H2>Starting a collection</H2>
          <Body>
            Click <strong>New Collection</strong> in the sidebar to begin. You can add batteries manually one at a
            time, or import a CSV file from your weighing system to pre-populate rows.
          </Body>
          <H2>Manual entry</H2>
          <StepList steps={[
            <>Click <strong>Add Battery Row</strong> to add a new line.</>,
            <>Enter the serial number, manufacturer, cell model, voltage, and weight for each battery.</>,
            <>If a field is unknown, leave it blank — it will be flagged for Itinium to review.</>,
            <>Once all rows are complete, click <strong>Submit Collection</strong>.</>,
          ]} />
          <H2>CSV import</H2>
          <StepList steps={[
            <>Click <strong>Import CSV</strong> and select your export file from the weighing system.</>,
            <>The system will map columns automatically. Rows with unrecognised values are highlighted in amber.</>,
            <>Review any flagged rows and fill in missing fields before submitting.</>,
          ]} />
          <H2>AI-assisted corrections</H2>
          <Body>
            When a manufacturer, cell model, or voltage value is flagged as unrecognised, the system uses AI to
            suggest a correction:
          </Body>
          <BulletList items={[
            <>High-confidence suggestions are applied automatically and shown in blue — you can restore the original value at any time.</>,
            <>Low-confidence suggestions appear as a prompt — click <strong>Accept</strong> to use the AI suggestion or <strong>Dismiss</strong> to keep your original value.</>,
            <>If you are confident your value is correct, tick the confirmation checkbox to flag it for Itinium review.</>,
          ]} />
          <Tip>
            Accepted and rejected AI suggestions are logged in the AI Correction Audit (administrators only). This
            data helps improve suggestion accuracy over time.
          </Tip>
          <H2>Saving a draft</H2>
          <Body>
            If you need to pause partway through, click <strong>Save Draft</strong>. Your progress is saved and you
            can resume from the Dashboard or the New Collection page at any time.
          </Body>
          <H2>Photo attachments</H2>
          <Body>
            You can attach a photo to any individual battery row using the camera icon on the right of that row.
            This is useful for documenting damaged or unusual batteries.
          </Body>
        </>
      ),
    },
    {
      id: "stillages",
      title: "Stillages",
      icon: Package,
      roles: "all",
      content: (
        <>
          <H2>What are stillages?</H2>
          <Body>
            Stillages are the metal cages or pallets used to transport batteries. The Stillages page lets you log
            when stillages are sent to or received from a depot, keeping an accurate count at each site.
          </Body>
          <H2>Logging a movement</H2>
          <StepList steps={[
            <>Go to <strong>Stillages</strong> in the sidebar.</>,
            <>Click <strong>Log Movement</strong>.</>,
            <>Select the direction (Sent or Received), the depot, the date, and the quantity.</>,
            <>Click <strong>Save</strong> to record the movement.</>,
          ]} />
          <H2>Viewing history</H2>
          <Body>
            The Stillages page shows a running log of all movements. You can filter by depot and date range. Team
            Leaders and Administrators can view movements across all depots; depot users see only their own location.
          </Body>
          <Tip>
            Keep stillage records up to date so Itinium can plan collections efficiently and ensure you always have
            enough cages on site.
          </Tip>
        </>
      ),
    },
    {
      id: "dashboard",
      title: "Dashboard",
      icon: LayoutDashboard,
      roles: ["team_leader", "accounts", "head_office_admin"],
      content: (
        <>
          <H2>Overview</H2>
          <Body>
            The Dashboard gives a real-time snapshot of operational activity — total jobs, tonnage collected, items
            pending review, and a list of recent collection submissions.
          </Body>
          <H2>Recent jobs list</H2>
          <Body>
            The table at the bottom of the Dashboard lists the most recent collections. Click any row to open the
            full job detail. The status column indicates whether a job is pending review, confirmed, or flagged for
            attention.
          </Body>
          <Tip>
            Depot users see a simpler home screen focused on their own submissions and drafts. The full Dashboard is
            available to Team Leaders, Accounts, and Administrators.
          </Tip>
        </>
      ),
    },
    {
      id: "job-management",
      title: "Job Management",
      icon: Briefcase,
      roles: ["team_leader", "accounts", "head_office_admin"],
      content: (
        <>
          <H2>Finding jobs</H2>
          <Body>
            The Job Management page lists all collection submissions. Use the search bar and filters to narrow
            results by client, depot, date range, or status.
          </Body>
          <H2>Reviewing a job</H2>
          <StepList steps={[
            <>Click any job row to open its detail page.</>,
            <>Review the battery list, flag reasons, and any attached photos.</>,
            <>If you have received the batteries at the processing facility, click <strong>Confirm Receipt</strong> to update the job status.</>,
            <>Accounts users and Administrators can also update financial fields such as the LME rate applied and the invoice reference.</>,
          ]} />
          <H2>Flagged batteries</H2>
          <Body>
            Rows flagged during submission are highlighted on the job detail page. The submitter's original value
            and any AI suggestion are both shown so you can decide on the correct value before confirming.
          </Body>
          <Note>
            Only Accounts users and Administrators can edit financial fields on a job after submission.
          </Note>
        </>
      ),
    },
    {
      id: "kpi-reporting",
      title: "KPI Reporting",
      icon: BarChart3,
      roles: ["accounts", "head_office_admin"],
      content: (
        <>
          <H2>Overview</H2>
          <Body>
            The KPI Reporting page displays financial and operational metrics across all collections. Charts update
            in real time based on submitted and confirmed jobs.
          </Body>
          <H2>Key charts</H2>
          <BulletList items={[
            <>Tonnage vs Target — monthly weight collected compared to your agreed target.</>,
            <>Gross Profit — revenue minus processing costs over time.</>,
            <>Collections by Client — breakdown of submission activity per client.</>,
            <>Flagged Batteries Rate — proportion of rows requiring manual review.</>,
          ]} />
          <H2>Filtering</H2>
          <Body>
            Use the date range and client filters at the top of the page to focus on a specific period or account.
            All charts update simultaneously when you change a filter.
          </Body>
          <Tip>
            KPI figures are based on confirmed jobs only. Make sure receipts are confirmed promptly to keep the
            numbers accurate.
          </Tip>
        </>
      ),
    },
    {
      id: "lme-pricing",
      title: "LME Pricing",
      icon: LineChart,
      roles: ["accounts", "head_office_admin"],
      content: (
        <>
          <H2>Live and manual rates</H2>
          <Body>
            The system fetches lead (LME) and currency exchange rates automatically. If the live feed is
            unavailable, you can set a manual fallback rate on this page.
          </Body>
          <StepList steps={[
            <>Go to <strong>LME Pricing</strong> in the sidebar.</>,
            <>Enter the manual rate in the fallback field and click <strong>Save</strong>. The system will use this rate until the live feed resumes.</>,
            <>The current effective rate — live or manual — is displayed at the top of the page.</>,
          ]} />
          <H2>Exporting jobs to Excel</H2>
          <Body>
            Click <strong>Export to Excel</strong> to download a spreadsheet of all confirmed jobs within the
            selected date range, including all battery rows, weights, values, and flag statuses.
          </Body>
          <H2>Generating PDF invoices</H2>
          <Body>
            Select one or more confirmed jobs from the list, then click <strong>Generate Invoice</strong>. A PDF is
            produced using the current LME rate and can be downloaded or sent to the client.
          </Body>
          <Note>
            Invoice generation requires at least one confirmed job. Pending or flagged jobs are excluded automatically.
          </Note>
        </>
      ),
    },
    {
      id: "clients",
      title: "Client Management",
      icon: Building2,
      roles: ["head_office_admin"],
      content: (
        <>
          <H2>Creating a client</H2>
          <StepList steps={[
            <>Go to <strong>Clients</strong> in the sidebar and click <strong>Add Client</strong>.</>,
            <>Enter the client name, contact email, and any relevant notes.</>,
            <>Click <strong>Save</strong>. The new client is immediately available for user and location assignment.</>,
          ]} />
          <H2>Managing locations</H2>
          <Body>
            Each client can have multiple collection locations (depots). On the client detail page, use the
            Locations tab to add, rename, or deactivate locations.
          </Body>
          <H2>Deactivating a client</H2>
          <Body>
            Toggle the <strong>Active</strong> switch on a client record to deactivate them. Deactivated clients
            cannot submit new collections but their historical data is fully retained.
          </Body>
          <Tip>
            Deactivating a location rather than deleting it preserves the full history linked to that site.
          </Tip>
        </>
      ),
    },
    {
      id: "schedule",
      title: "Schedule",
      icon: CalendarDays,
      roles: ["head_office_admin"],
      content: (
        <>
          <H2>Calendar view</H2>
          <Body>
            The Schedule page shows all upcoming and past collections on a calendar. Each entry displays the client,
            depot, and collection date. Click any entry to open the full job detail.
          </Body>
          <H2>Rescheduling a collection</H2>
          <Body>
            Drag a collection event to a new date on the calendar to reschedule it. A confirmation prompt appears
            before the change is saved. Every reschedule is recorded in the audit log with the reason and timestamp.
          </Body>
          <H2>Adding a planned collection</H2>
          <StepList steps={[
            <>Click an empty day on the calendar or use the <strong>Add</strong> button.</>,
            <>Select the client and depot, set the planned date, and add any notes.</>,
            <>Click <strong>Save</strong>. The depot team will see the scheduled date on their dashboard.</>,
          ]} />
        </>
      ),
    },
    {
      id: "user-access",
      title: "User Access",
      icon: Users,
      roles: ["team_leader", "head_office_admin"],
      content: (
        <>
          <H2>Viewing users</H2>
          <Body>
            The User Access page lists all users. Team Leaders see only users belonging to their own client.
            Administrators see all users across all clients.
          </Body>
          <H2>Creating a new user</H2>
          <StepList steps={[
            <>Click <strong>Invite User</strong>.</>,
            <>Enter their full name, email address, and select their role.</>,
            <>For depot users and team leaders, assign the correct client and depot.</>,
            <>Click <strong>Send Invite</strong>. The user will receive an email with a link to set their password.</>,
          ]} />
          <H2>User roles explained</H2>
          <BulletList items={[
            <><strong>Depot User</strong> — can submit collections and view their own stillage movements.</>,
            <><strong>Team Leader</strong> — can manage users and locations for their client, and view all jobs for that client.</>,
            <><strong>Accounts</strong> — full financial access: KPI reporting, LME rates, invoicing.</>,
            <><strong>Primary Administrator</strong> — full system access including clients, schedule, and AI correction audit.</>,
          ]} />
          <H2>Deactivating a user</H2>
          <Body>
            Toggle the <strong>Active</strong> switch on a user record to prevent them from signing in. All their
            historical submissions are retained.
          </Body>
          <Note>
            Team Leaders can only manage users within their own client — they cannot view or edit users belonging to
            other clients.
          </Note>
        </>
      ),
    },
    {
      id: "locations",
      title: "Locations",
      icon: MapPin,
      roles: ["team_leader"],
      content: (
        <>
          <H2>Managing your locations</H2>
          <Body>
            As a Team Leader you can add and manage collection locations (depots) for your client. Go to{" "}
            <strong>Locations</strong> in the sidebar to see the full list.
          </Body>
          <H2>Adding a location</H2>
          <StepList steps={[
            <>Click <strong>Add Location</strong>.</>,
            <>Enter the depot name and any relevant address or reference information.</>,
            <>Click <strong>Save</strong>. The location is immediately available when creating users or submitting collections.</>,
          ]} />
          <H2>Deactivating a location</H2>
          <Body>
            Toggle the <strong>Active</strong> switch on a location to deactivate it. Deactivated locations no
            longer appear in dropdowns for new submissions, but all historical data is fully preserved.
          </Body>
        </>
      ),
    },
    {
      id: "ai-audit",
      title: "AI Correction Audit",
      icon: ClipboardList,
      roles: ["head_office_admin"],
      content: (
        <>
          <H2>What is tracked</H2>
          <Body>
            Every time the AI suggests a correction for a manufacturer name, cell model, or voltage value, the
            event is recorded — including the original value, the suggestion, and whether the user accepted or
            rejected it.
          </Body>
          <H2>Reading the audit log</H2>
          <BulletList items={[
            <><strong>Original → Suggested</strong>: the value submitted by the depot user and the AI's proposed correction.</>,
            <><strong>Confidence</strong> — Auto-applied (⚡) means the AI was highly confident and applied the change automatically; User reviewed (⚠) means the suggestion was shown to the user for approval.</>,
            <><strong>Outcome</strong> — Accepted means the user kept the AI's value; Rejected means the user kept their original.</>,
          ]} />
          <H2>Filtering and exporting</H2>
          <Body>
            Use the filters at the top to narrow by date range, field type, and outcome. The stats row updates to
            reflect filtered data. Click <strong>Export CSV</strong> to download the current view as a spreadsheet.
          </Body>
          <Tip>
            High rejection rates on a particular field may indicate that the AI's data for that value is outdated.
            Use this page to spot patterns and raise a support ticket if a correction model needs updating.
          </Tip>
        </>
      ),
    },
    {
      id: "settings",
      title: "Settings",
      icon: Settings,
      roles: "all",
      content: (
        <>
          <H2>Profile and password</H2>
          <StepList steps={[
            <>Go to <strong>Settings</strong> in the sidebar.</>,
            <>Update your display name or email address under the Profile tab.</>,
            <>To change your password, enter your current password and then your new password twice.</>,
            <>Click <strong>Save</strong> to apply changes.</>,
          ]} />
          <H2>System settings (Administrators only)</H2>
          <Body>
            Administrators have additional settings tabs:
          </Body>
          <BulletList items={[
            <><strong>Weight References</strong> — view and update the standard weight lookup table used when auto-calculating battery weights.</>,
            <><strong>Collection Points</strong> — manage the list of pre-set collection locations shown in dropdown menus.</>,
            <><strong>System</strong> — configure platform-wide defaults and notification preferences.</>,
          ]} />
          <Note>
            Changes to weight references take effect immediately on all new submissions. Existing job calculations
            are not retroactively updated.
          </Note>
        </>
      ),
    },
    {
      id: "troubleshooting",
      title: "Tips & Troubleshooting",
      icon: Lightbulb,
      roles: "all",
      content: (
        <>
          <H2>CSV import not working</H2>
          <BulletList items={[
            <>Make sure the file is saved as a plain CSV (not .xlsx). Export from Excel as CSV if needed.</>,
            <>Check that your weighing system export includes a header row — the importer uses column names to map fields.</>,
            <>If specific columns are not detected, contact your administrator to verify the column mapping configuration.</>,
          ]} />
          <H2>AI suggestion seems wrong</H2>
          <Body>
            If the AI consistently suggests an incorrect value for a particular battery, click{" "}
            <strong>Dismiss</strong> to keep your original value and tick the confirmation checkbox to flag it for
            Itinium review. Use Help &amp; Support to raise a ticket with details.
          </Body>
          <H2>Forgot your password</H2>
          <Body>
            Click <strong>Forgot password?</strong> on the login screen, enter your email address, and you will
            receive a reset link within a few minutes. Check your spam folder if it does not arrive.
          </Body>
          <H2>Page not loading or session expired</H2>
          <Body>
            If the portal appears blank or shows an error, try refreshing the page. If you have been inactive for a
            long period your session may have expired — simply log in again.
          </Body>
          <H2>Need more help?</H2>
          <Body>
            Use the <strong>Help &amp; Support</strong> button at the bottom of the sidebar to submit a ticket
            directly to the Itinium team. Include as much detail as possible — a screenshot is attached
            automatically.
          </Body>
          <Success>
            Support tickets are monitored during UK business hours. For urgent issues, write{" "}
            <strong>URGENT</strong> at the start of your message.
          </Success>
        </>
      ),
    },
  ];
}

export default function HelpPage() {
  const { user } = useAuth();
  const role = user?.role;

  const allSections = buildSections();
  const sections = allSections.filter((s) => {
    if (!role) return false;
    if (s.roles === "all") return true;
    return (s.roles as string[]).includes(role);
  });

  const [activeId, setActiveId] = useState<string>("");
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (sections.length > 0 && !activeId) {
      setActiveId(sections[0].id);
    }
  }, [sections.length, activeId]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the topmost intersecting section
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id.replace("section-", ""));
        }
      },
      { root: null, rootMargin: "0px 0px -60% 0px", threshold: 0 }
    );

    sections.forEach((s) => {
      const el = document.getElementById(`section-${s.id}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [sections]);

  function scrollTo(id: string) {
    const el = document.getElementById(`section-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      setActiveId(id);
    }
  }

  if (!user) {
    return (
      <SidebarLayout title="User Guide" subtitle="Loading...">
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading...</div>
      </SidebarLayout>
    );
  }

  return (
    <SidebarLayout
      title="User Guide"
      subtitle="Everything you need to know about using the Itinium Battery Portal"
    >
      <div className="flex gap-6" style={{ minHeight: "calc(100vh - 130px)" }}>
        {/* Table of contents */}
        <aside className="w-56 flex-shrink-0 self-start sticky top-6">
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 px-1">Contents</p>
            <nav className="space-y-0.5">
              {sections.map((s) => {
                const isActive = activeId === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => scrollTo(s.id)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-xs font-medium transition-all ${
                      isActive
                        ? "bg-[#0ea5e9]/10 text-[#0284c7] border-l-2 border-[#0ea5e9]"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900 border-l-2 border-transparent"
                    }`}
                  >
                    <s.icon className={`w-3.5 h-3.5 flex-shrink-0 ${isActive ? "text-[#0ea5e9]" : "text-slate-400"}`} />
                    <span className="leading-tight">{s.title}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Content */}
        <div
          ref={contentRef}
          className="flex-1 space-y-4 pr-1 pb-12"
        >
          {sections.map((s) => (
            <div
              key={s.id}
              id={`section-${s.id}`}
              className="bg-white border border-slate-200 rounded-xl p-7 shadow-sm scroll-mt-4"
            >
              <div className="flex items-center gap-3 mb-5 pb-4 border-b border-slate-100">
                <div className="w-9 h-9 rounded-lg bg-[#0ea5e9]/10 flex items-center justify-center flex-shrink-0">
                  <s.icon className="w-5 h-5 text-[#0ea5e9]" />
                </div>
                <h2 className="text-lg font-bold text-[#0f2744]">{s.title}</h2>
              </div>
              {s.content}
            </div>
          ))}
        </div>
      </div>
    </SidebarLayout>
  );
}
