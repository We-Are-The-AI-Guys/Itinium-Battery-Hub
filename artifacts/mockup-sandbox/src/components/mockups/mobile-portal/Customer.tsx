import "./_group.css";
import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, BarChart3, BriefcaseBusiness, CalendarDays, Check,
  ChevronRight, ClipboardList, Download, FileText, Home, MapPin, Package, Plus,
  Scale, ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";

type Page = "overview" | "jobs" | "report" | "book" | "detail" | "documents";
type Job = {
  id: string; ref: string; site: string; date: string; submitted: string; weight: string;
  pallets: number; status: "Requested" | "Confirmed" | "Received" | "Invoice" | "Completed";
  batteries: { pallet: string; make: string; type: string; serial: string; voltage: string; loose?: string }[];
};
const startingJobs: Job[] = [
  { id:"j1", ref:"IT-28461",site:"North Quay Depot",date:"18 Jun 2025",submitted:"11 Jun 2025",weight:"2.84 t",pallets:4,status:"Confirmed",batteries:[
    {pallet:"P-041",make:"EnerSys",type:"VRLA",serial:"A9-11824",voltage:"12 V"},
    {pallet:"P-042",make:"Yuasa",type:"VRLA",serial:"UX-77301",voltage:"12 V"},
    {pallet:"P-043",make:"Exide",type:"Traction",serial:"TR-48211",voltage:"48 V"},
    {pallet:"P-044",make:"Mixed",type:"Loose cells",serial:"—",voltage:"2 V",loose:"18 cells"},
  ]},
  { id:"j2", ref:"IT-28418",site:"North Quay Depot",date:"04 Jun 2025",submitted:"28 May 2025",weight:"1.62 t",pallets:3,status:"Received",batteries:[
    {pallet:"P-037",make:"Enersys",type:"VRLA",serial:"A9-10814",voltage:"12 V"},
    {pallet:"P-038",make:"Crown",type:"Traction",serial:"CR-61022",voltage:"24 V"},
    {pallet:"P-039",make:"Mixed",type:"Loose cells",serial:"—",voltage:"2 V",loose:"9 cells"},
  ]},
  { id:"j3", ref:"IT-28196",site:"Riverside Service Centre",date:"22 May 2025",submitted:"14 May 2025",weight:"3.16 t",pallets:5,status:"Completed",batteries:[
    {pallet:"P-029",make:"EnerSys",type:"VRLA",serial:"A8-96012",voltage:"12 V"},
    {pallet:"P-030",make:"Trojan",type:"Deep cycle",serial:"T-349013",voltage:"6 V"},
  ]},
  { id:"j4", ref:"IT-28143",site:"North Quay Depot",date:"16 May 2025",submitted:"08 May 2025",weight:"0.94 t",pallets:2,status:"Invoice",batteries:[
    {pallet:"P-025",make:"Yuasa",type:"VRLA",serial:"UX-69410",voltage:"12 V"},
    {pallet:"P-026",make:"Exide",type:"Traction",serial:"EX-5082",voltage:"48 V"},
  ]},
  { id:"j5", ref:"IT-28072",site:"Riverside Service Centre",date:"08 May 2025",submitted:"30 Apr 2025",weight:"1.28 t",pallets:2,status:"Requested",batteries:[
    {pallet:"P-021",make:"EnerSys",type:"VRLA",serial:"A8-91173",voltage:"12 V"},
    {pallet:"P-022",make:"Mixed",type:"Loose cells",serial:"—",voltage:"2 V",loose:"12 cells"},
  ]},
];
const reportRows = [
  {date:"2025-05-06",tonnes:1.28},{date:"2025-05-08",tonnes:.94},{date:"2025-05-12",tonnes:1.46},
  {date:"2025-05-16",tonnes:3.12},{date:"2025-05-19",tonnes:1.38},{date:"2025-05-22",tonnes:3.16},
  {date:"2025-05-27",tonnes:1.17},{date:"2025-06-03",tonnes:1.42},{date:"2025-06-04",tonnes:1.62},
  {date:"2025-06-11",tonnes:2.84},{date:"2025-06-17",tonnes:.96},{date:"2025-06-20",tonnes:1.12},
];
const roles = {
  accounts: { label:"Accounts", scope:"Client-wide · finance & export access", site:"All authorised depots" },
  lead: { label:"Lead Client", scope:"Client-wide · finance & export access", site:"All authorised depots" },
  team: { label:"Team Leader", scope:"One assigned location · no KPI finance", site:"North Quay Depot only" },
  warehouse: { label:"Warehouse", scope:"Site-scoped · operational view only", site:"North Quay Depot only" },
} as const;
type Role = keyof typeof roles;

function statusClass(status: Job["status"]) {
  if (status === "Completed") return "green";
  if (status === "Requested") return "amber";
  if (status === "Received") return "neutral";
  return "";
}

export default function Customer() {
  const [role, setRole] = useState<Role>("accounts");
  const [page, setPage] = useState<Page>("overview");
  const [jobs, setJobs] = useState(startingJobs);
  const [selectedId, setSelectedId] = useState("j1");
  const [filter, setFilter] = useState("All");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [bookingStep, setBookingStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({ site:"North Quay Depot", date:"2025-06-25", pallets:"3", notes:"" });
  const [reportFrom, setReportFrom] = useState("2025-05-01");
  const [reportTo, setReportTo] = useState("2025-06-30");
  const selected = jobs.find((job) => job.id === selectedId) ?? jobs[0];
  const isAccounts = role === "accounts" || role === "lead";
  const visibleJobs = useMemo(() => jobs.filter((job) => {
    const withinScope = role === "accounts" || role === "lead" || job.site === "North Quay Depot";
    const matchesFilter = filter === "All" || job.status === filter;
    const matchesSearch = `${job.ref} ${job.site} ${job.status}`.toLowerCase().includes(search.toLowerCase());
    return withinScope && matchesFilter && matchesSearch;
  }), [jobs, role, filter, search]);

  function openJob(id: string) { setSelectedId(id); setPage("detail"); setNotice(""); }
  function simulateRequest(kind: "amendment" | "cancellation") {
    setNotice(`${kind === "amendment" ? "Amendment" : "Cancellation"} request preview only. Itinium reviews customer requests; the official job record is unchanged.`);
  }
  function startBooking() {
    setBookingStep(1);
    setForm({ site:"North Quay Depot", date:"2025-06-25", pallets:"3", notes:"" });
    setPage("book");
    setNotice("");
  }
  function previewBooking() {
    if (!form.site || !form.date || Number(form.pallets) < 1) { setNotice("Add a location, date and at least one pallet to continue."); return; }
    setBookingStep(2);
    setNotice("");
  }
  function finishBooking() {
    const next: Job = {
      id:`local-${Date.now()}`, ref:"PREVIEW REQUEST", site:form.site,
      date:new Date(`${form.date}T12:00:00`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric"}),
      submitted:"Today",weight:"Estimate on review",pallets:Number(form.pallets),status:"Requested",
      batteries:Array.from({length:Math.min(Number(form.pallets),4)},(_,i)=>({pallet:`New pallet ${i+1}`,make:"To identify",type:"Not specified",serial:"—",voltage:"—"})),
    };
    setJobs([next,...jobs]); setSelectedId(next.id); setBookingStep(3);
  }
  function go(pageName: Page) { setPage(pageName); setNotice(""); }
  const dateRange = `${new Date(`${reportFrom}T12:00:00`).toLocaleDateString("en-GB",{month:"short",year:"numeric"})} — ${new Date(`${reportTo}T12:00:00`).toLocaleDateString("en-GB",{month:"short",year:"numeric"})}`;
  const filteredReportRows = reportRows.filter((row)=>row.date>=reportFrom&&row.date<=reportTo);
  const totalReportTonnes = filteredReportRows.reduce((sum,row)=>sum+row.tonnes,0).toFixed(1);

  return (
    <div className="it-mobile">
      <header className="im-header">
        <div className="im-brand"><span className="im-mark">i</span><div className="im-wordmark">itinium<small>Battery portal</small></div></div>
        <span className="im-concept">Concept · local demo</span>
      </header>
      <main className="im-scroll">
        <div className="im-scope"><ShieldCheck size={13}/><span>Viewing as <strong>{roles[role].label}</strong></span></div>
        <div className="im-field" style={{marginTop:0}}>
          <label htmlFor="customer-role">Role preview · changes what this user can see</label>
          <select id="customer-role" value={role} onChange={(event) => { setRole(event.target.value as Role); setPage("overview"); setNotice(""); }}>
            {Object.entries(roles).map(([key,value])=><option key={key} value={key}>{value.label} — {value.scope}</option>)}
          </select>
        </div>

        {page === "overview" && <section>
          <p className="im-eyebrow" style={{marginTop:20}}>Customer workspace</p>
          <h1 className="im-title">Good morning,<br/>North Quay team.</h1>
          <p className="im-subtitle">{roles[role].site} · your collections at a glance.</p>
          <div className="im-hero" style={{marginTop:18}}>
            <p className="im-eyebrow">Next collection</p>
            <h2>18 June<br/>North Quay Depot</h2>
            <p>Itinium is coordinating your confirmed collection.</p>
            <div className="im-hero-foot"><small>IT-28461 · 4 pallets</small><strong>2.84 t</strong></div>
            <button onClick={()=>openJob("j1")} aria-label="View next collection" style={{position:"absolute",inset:0,opacity:0}}/>
          </div>
          {role !== "warehouse" && <button className="im-btn" style={{marginTop:11}} onClick={startBooking}><Plus size={16}/> Book a collection</button>}
          {role === "warehouse" && <div className="im-notice" style={{marginTop:11}}>Operational view only. Collection requests and finance are not available to Warehouse roles.</div>}
          <div className="im-stat-row">
            <div className="im-card im-stat"><div className="im-stat-label">Open collections</div><div className="im-stat-value">{jobs.filter((job)=>["Requested","Confirmed"].includes(job.status)).length}</div><div className="im-stat-detail">Across your allowed sites</div></div>
            <div className="im-card im-stat"><div className="im-stat-label">Pallets recorded</div><div className="im-stat-value">{jobs.reduce((sum,job)=>sum+job.pallets,0)}</div><div className="im-stat-detail">In this sample period</div></div>
          </div>
          <div className="im-section-head"><h2>Recent jobs</h2><button onClick={()=>go("jobs")}>All jobs <ArrowRight size={12}/></button></div>
          {jobs.slice(0,2).map((job)=><JobCard key={job.id} job={job} onOpen={()=>openJob(job.id)}/>)}
          <div className="im-notice" style={{marginTop:13}}>Official job changes are made by Itinium. This concept does not save or send requests.</div>
        </section>}

        {page === "jobs" && <section>
          <p className="im-eyebrow" style={{marginTop:20}}>Collection history</p><h1 className="im-title">Your jobs</h1>
          <p className="im-subtitle">Jobs visible to your {role === "accounts" || role === "lead" ? "client" : "assigned location"}.</p>
          <div className="im-field"><label htmlFor="job-search">Find a reference or site</label><input id="job-search" placeholder="e.g. IT-28461" value={search} onChange={(event)=>setSearch(event.target.value)}/></div>
          <div className="im-switch">{["All","Requested","Confirmed","Received","Invoice","Completed"].map((status)=><button key={status} className={filter===status?"on":""} onClick={()=>setFilter(status)}>{status==="Requested"?"New":status}</button>)}</div>
          {visibleJobs.length ? visibleJobs.map((job)=><JobCard key={job.id} job={job} onOpen={()=>openJob(job.id)}/>) :
            <div className="im-card" style={{textAlign:"center",padding:26}}><ClipboardList size={25} style={{margin:"0 auto 10px",color:"#8298a6"}}/><strong>No matching jobs</strong><p className="im-subtitle">Try another status or search term.</p><button className="im-link" onClick={()=>{setFilter("All");setSearch("");}}>Clear filters</button></div>}
        </section>}

        {page === "report" && <section>
          <p className="im-eyebrow" style={{marginTop:20}}>Accounts report</p><h1 className="im-title">KPI reporting</h1>
          <p className="im-subtitle">A date-filtered client view. Finance and Excel export are available to Accounts and Lead Client only.</p>
          {!isAccounts ? <div className="im-notice warn" style={{marginTop:16}}>KPI finance and exports are not available for {roles[role].label}. Switch to an Accounts or Lead Client preview role to see this journey.</div> :
          <>
            <div className="im-card" style={{marginTop:16}}>
              <div className="im-row"><span className="im-eyebrow" style={{margin:0}}>Report period</span><CalendarDays size={16} color="#138bb7"/></div>
              <div className="im-field"><label htmlFor="from-date">From</label><input id="from-date" type="date" value={reportFrom} onChange={(event)=>setReportFrom(event.target.value)}/></div>
              <div className="im-field"><label htmlFor="to-date">To</label><input id="to-date" type="date" value={reportTo} onChange={(event)=>setReportTo(event.target.value)}/></div>
            </div>
            <div className="im-section-head"><h2>Client summary</h2><span style={{fontSize:9,color:"#71869a"}}>{dateRange}</span></div>
            <div className="im-stat-row">
              <div className="im-card im-stat"><div className="im-stat-label">Collections</div><div className="im-stat-value">{filteredReportRows.length}</div><div className="im-stat-detail">In selected period</div></div>
              <div className="im-card im-stat"><div className="im-stat-label">Total weight</div><div className="im-stat-value">{totalReportTonnes}</div><div className="im-stat-detail">Tonnes collected</div></div>
            </div>
            <div className="im-card" style={{marginTop:10}}>
              <div className="im-row"><div><div className="im-stat-label">Average collection</div><div className="im-stat-value" style={{fontSize:18}}>1.53 t</div></div><Scale size={19} color="#138bb7"/></div>
              <div className="im-divider"/><div className="im-row"><span style={{fontSize:10,color:"#708398"}}>Jobs included</span><strong style={{fontSize:11}}>{filteredReportRows.length} records</strong></div>
            </div>
            <button className="im-btn" style={{marginTop:12}} onClick={()=>setNotice(filteredReportRows.length?`Export preview · ${filteredReportRows.length} sample job rows for ${dateRange}. No spreadsheet is generated or downloaded.`:"No sample job rows fall in this period. No spreadsheet is generated or downloaded.")}><Download size={15}/> Preview Excel export</button>
            <p style={{fontSize:9,color:"#8292a0",lineHeight:1.45,margin:"9px 2px"}}>Export includes one row per job and follows this date range and client scope. No internal Itinium finance is shown.</p>
          </>}
        </section>}

        {page === "detail" && selected && <section>
          <button className="im-back" onClick={()=>go("jobs")}><ArrowLeft size={15}/> All jobs</button>
          <div className="im-card im-detail-hero">
            <div className="im-jobtop"><div><p className="im-eyebrow" style={{marginBottom:4}}>Job reference</p><h1 className="im-title" style={{fontSize:22}}>{selected.ref}</h1></div><span className={`im-status ${statusClass(selected.status)}`}>{selected.status}</span></div>
            <div className="im-detail-facts">
              <Fact icon={<MapPin size={13}/>} label="Location" value={selected.site}/>
              <Fact icon={<CalendarDays size={13}/>} label="Collection date" value={selected.date}/>
              <Fact icon={<Scale size={13}/>} label="Total load" value={selected.weight}/>
              <Fact icon={<Package size={13}/>} label="Pallet count" value={`${selected.pallets} pallets`}/>
            </div>
            <p style={{fontSize:9,color:"#8395a2",margin:"16px 0 0"}}>Submitted {selected.submitted} · official changes by Itinium</p>
          </div>
          <div className="im-section-head"><h2>Battery detail</h2><span style={{fontSize:10,color:"#7b8e9c"}}>{selected.batteries.length} lines</span></div>
          <p className="im-subtitle" style={{marginTop:-6}}>Pallet-first view for a quick check at the depot.</p>
          {selected.batteries.map((battery,index)=><div className="im-pallet" key={`${battery.pallet}-${index}`}>
            <div className="im-pallet-id">{battery.pallet}</div><h3>{battery.make} · {battery.type}</h3>
            <div className="im-pallet-grid">
              <span>Asset / serial<strong>{battery.serial}</strong></span><span>Voltage<strong>{battery.voltage}</strong></span>
              <span>Cell type<strong>{battery.type}</strong></span><span>Loose cells<strong>{battery.loose||"None noted"}</strong></span>
            </div>
          </div>)}
          <div className="im-section-head"><h2>Customer requests</h2></div>
          {["Requested","Confirmed"].includes(selected.status) ?
            <div className="im-card"><p className="im-subtitle" style={{margin:0}}>Ask Itinium to amend details or cancel before collection. Itinium reviews the request; this preview does not change the official job.</p>
              <div style={{display:"flex",gap:8,marginTop:12}}><button className="im-btn secondary" onClick={()=>simulateRequest("amendment")}>Request amendment</button><button className="im-btn quiet" onClick={()=>simulateRequest("cancellation")}>Request cancellation</button></div>
            </div> :
            <div className="im-notice">Amendment and cancellation requests are unavailable from Received onward. Contact Itinium for help with this job.</div>}
          <div className="im-section-head"><h2>Signed documents</h2></div>
          {["Invoice","Completed"].includes(selected.status) ? <>
            <DocumentButton title="Signed collection sheet" onClick={()=>setNotice("Document preview: signed collection sheet · no file download in this concept.")}/>
            <DocumentButton title="Signed consignment note" onClick={()=>setNotice("Document preview: signed consignment note · no file download in this concept.")}/>
          </> : <div className="im-notice">Signed collection sheet and consignment note appear here from Invoice onward.</div>}
          {notice && <div className="im-toast" role="status">{notice}</div>}
        </section>}

        {page === "documents" && <section>
          <button className="im-back" onClick={()=>selected&&openJob(selected.id)}><ArrowLeft size={15}/> Back to job</button>
          <p className="im-eyebrow">Document centre</p><h1 className="im-title">Signed documents</h1>
          <p className="im-subtitle">Available to the customer when a job reaches Invoice or Completed.</p>
        </section>}

        {page === "book" && <section>
          <button className="im-back" onClick={()=>go("overview")}><ArrowLeft size={15}/> Back to overview</button>
          <p className="im-eyebrow">New collection · local walkthrough</p><h1 className="im-title">{bookingStep===1?"Tell us what’s ready.":bookingStep===2?"Check your request.":"Preview created"}</h1>
          <p className="im-subtitle">This guided preview demonstrates the customer request. Nothing is submitted to Itinium.</p>
          {bookingStep===1 && <div className="im-card" style={{marginTop:16}}>
            <div className="im-field" style={{marginTop:0}}><label htmlFor="book-site">Collection location</label><select id="book-site" value={form.site} onChange={(event)=>setForm({...form,site:event.target.value})}><option>North Quay Depot</option>{isAccounts&&<option>Riverside Service Centre</option>}</select></div>
            <div className="im-field"><label htmlFor="book-date">Preferred collection date</label><input id="book-date" type="date" value={form.date} onChange={(event)=>setForm({...form,date:event.target.value})}/></div>
            <div className="im-field"><label htmlFor="book-pallets">Estimated pallet count</label><input id="book-pallets" type="number" min="1" max="26" value={form.pallets} onChange={(event)=>setForm({...form,pallets:event.target.value})}/></div>
            <div className="im-field"><label htmlFor="book-notes">Site or access notes</label><textarea id="book-notes" placeholder="Anything the collection team should know?" value={form.notes} onChange={(event)=>setForm({...form,notes:event.target.value})}/></div>
            <div className="im-notice" style={{marginTop:12}}>Pallet details and battery types can be reviewed as part of the request. Itinium confirms the official collection details.</div>
            <button className="im-btn" style={{marginTop:13}} onClick={previewBooking}>Review collection <ArrowRight size={15}/></button>
          </div>}
          {bookingStep===2 && <div className="im-card" style={{marginTop:16}}>
            <p className="im-eyebrow">Request summary</p><h2 style={{font:"700 17px Manrope",margin:"0 0 15px"}}>{form.site}</h2>
            <Fact icon={<CalendarDays size={13}/>} label="Preferred date" value={new Date(`${form.date}T12:00:00`).toLocaleDateString("en-GB",{weekday:"short",day:"numeric",month:"short",year:"numeric"})}/>
            <div className="im-divider"/><Fact icon={<Package size={13}/>} label="Estimated pallets" value={`${form.pallets} pallets`}/>
            {form.notes && <p className="im-subtitle">Notes: {form.notes}</p>}
            <div className="im-notice warn" style={{marginTop:14}}>Preview only: confirming below creates a sample request on this screen. No API, email or real booking.</div>
            <button className="im-btn" style={{marginTop:12}} onClick={finishBooking}><Check size={15}/> Create local preview</button>
            <button className="im-btn quiet" style={{marginTop:8}} onClick={()=>setBookingStep(1)}>Edit request</button>
          </div>}
          {bookingStep===3 && <div className="im-card" style={{marginTop:16}}>
            <div style={{width:38,height:38,borderRadius:50,background:"#e3f1e9",color:"#357059",display:"grid",placeItems:"center",marginBottom:13}}><Check size={19}/></div>
            <h2 style={{font:"700 17px Manrope",margin:"0 0 6px"}}>Preview request added</h2><p className="im-subtitle">PREVIEW REQUEST is now at the top of your local jobs list. It is not a real submission, and Itinium has not been notified.</p>
            <button className="im-btn" style={{marginTop:14}} onClick={()=>go("overview")}>Return to overview</button>
            <button className="im-btn quiet" style={{marginTop:8}} onClick={()=>go("jobs")}>Review jobs</button>
          </div>}
          {notice && <div className="im-toast" role="status">{notice}</div>}
        </section>}
      </main>
      <nav className="im-nav" aria-label="Customer navigation">
        <NavButton active={page==="overview"} label="Home" icon={<Home size={18}/>} onClick={()=>go("overview")}/>
        <NavButton active={page==="jobs"||page==="detail"||page==="documents"} label="Jobs" icon={<BriefcaseBusiness size={18}/>} onClick={()=>go("jobs")}/>
        {isAccounts && <NavButton active={page==="report"} label="Report" icon={<BarChart3 size={18}/>} onClick={()=>go("report")}/>}
        {role !== "warehouse" && <NavButton active={page==="book"} label="Book" icon={<Plus size={19}/>} onClick={startBooking}/>}
      </nav>
    </div>
  );
}

function JobCard({job,onOpen}:{job:Job;onOpen:()=>void}) {
  return <button className="im-card im-jobrow" onClick={onOpen}>
    <div className="im-jobtop"><div><div className="im-ref">{job.ref}</div><div style={{fontSize:10,color:"#718497",marginTop:3}}>{job.site}</div></div><span className={`im-status ${statusClass(job.status)}`}>{job.status}</span></div>
    <div className="im-jobmeta"><div className="im-meta"><CalendarDays size={13}/><span>Collection<strong>{job.date}</strong></span></div><div className="im-meta"><Package size={13}/><span>Load<strong>{job.pallets} pallets · {job.weight}</strong></span></div></div>
    <div className="im-open"><span>View collection details</span><ChevronRight size={14}/></div>
  </button>;
}
function Fact({icon,label,value}:{icon:ReactNode;label:string;value:string}) {
  return <div style={{display:"flex",gap:7,alignItems:"flex-start"}}><span style={{color:"#138bb7",paddingTop:1}}>{icon}</span><span><span className="im-fact-label">{label}</span><span className="im-fact-value">{value}</span></span></div>;
}
function DocumentButton({title,onClick}:{title:string;onClick:()=>void}) {
  return <button className="im-doc" onClick={onClick}><span className="im-doc-mark"><FileText size={16}/></span><span><strong>{title}</strong><small>Signed PDF · document preview</small></span><Download size={14}/></button>;
}
function NavButton({active,label,icon,onClick}:{active:boolean;label:string;icon:ReactNode;onClick:()=>void}) {
  return <button className={active?"active":""} aria-current={active?"page":undefined} onClick={onClick}>{icon}{label}</button>;
}
