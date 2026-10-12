import "./_group.css";
import "./_admin.css";
import { useMemo, useState } from "react";
import {
  ArrowLeft, ArrowRight, Check, ChevronRight, ClipboardCheck, Clock3,
  MapPin, Package, Search, ShieldCheck, Truck, X, Scale, AlertTriangle,
} from "lucide-react";

type JobStatus = "Requested" | "Confirmed" | "Received" | "Invoice" | "Completed" | "Cancelled";
type RequestKind = "amendment" | "cancellation" | "transport_exception";
type Job = {
  id:string; ref:string; site:string; requester:string; date:string; submitted:string; status:JobStatus;
  pallets:number; weight:string; pb:string; confirmedPallets:string; confirmedPb:string;
  released:boolean; provisional?:string; schedule:"none"|"proposed"|"confirmed"; proposedDate?:string;
  vehicle?:string; driver?:string; rows:{pallet:string;make:string;type:string;weight:string;pb:string;provisional?:boolean;note?:string}[];
};
type Request = {id:string;jobId:string;kind:RequestKind;status:"Pending"|"Approved"|"Rejected";requester:string;created:string;note:string;decisionNote?:string};
const seedJobs:Job[]=[
  {id:"a1",ref:"IT-29604",site:"North Quay Depot",requester:"Nina Shaw",date:"24 Jun 2025",submitted:"18 Jun 2025",status:"Confirmed",pallets:4,weight:"2.36 t est.",pb:"1,428 kg est.",confirmedPallets:"—",confirmedPb:"—",released:true,provisional:"Pallet P-207 · unknown traction pack. Identify chemistry and weight at collection.",schedule:"proposed",proposedDate:"26 Jun 2025",vehicle:"YK24 RCU",driver:"Asha Patel",rows:[{pallet:"P-205",make:"EnerSys",type:"VRLA · 12 V",weight:"612 kg",pb:"367 kg"},{pallet:"P-206",make:"Yuasa",type:"VRLA · 12 V",weight:"748 kg",pb:"449 kg"},{pallet:"P-207",make:"Exide",type:"Traction · 48 V",weight:"—",pb:"—",provisional:true,note:"Weight and chemistry to be checked on collection."},{pallet:"P-208",make:"Mixed",type:"Loose cells · 2 V",weight:"1,000 kg est.",pb:"612 kg est."}]},
  {id:"a2",ref:"IT-29571",site:"Avonmouth Works",requester:"Leon Morris",date:"27 Jun 2025",submitted:"19 Jun 2025",status:"Requested",pallets:3,weight:"1.84 t",pb:"1,106 kg",confirmedPallets:"—",confirmedPb:"—",released:false,schedule:"none",rows:[{pallet:"P-199",make:"Crown",type:"Traction · 24 V",weight:"780 kg",pb:"468 kg"},{pallet:"P-200",make:"EnerSys",type:"VRLA · 12 V",weight:"644 kg",pb:"386 kg"},{pallet:"P-201",make:"Yuasa",type:"VRLA · 12 V",weight:"416 kg",pb:"252 kg"}]},
  {id:"a6",ref:"IT-29522",site:"Riverside Service Centre",requester:"Marta Evans",date:"30 Jun 2025",submitted:"19 Jun 2025",status:"Requested",pallets:2,weight:"1.22 t est.",pb:"732 kg est.",confirmedPallets:"—",confirmedPb:"—",released:false,provisional:"Pallet P-214 · mixed battery pack, chemistry and actual weight to be checked at collection.",schedule:"none",rows:[{pallet:"P-213",make:"Yuasa",type:"VRLA · 12 V",weight:"640 kg",pb:"384 kg"},{pallet:"P-214",make:"Mixed",type:"Unknown traction pack",weight:"580 kg est.",pb:"348 kg est.",provisional:true,note:"Itinium provisional estimate. Identify battery chemistry and weigh at collection."}]},
  {id:"a3",ref:"IT-29498",site:"East Yard",requester:"Nina Shaw",date:"19 Jun 2025",submitted:"10 Jun 2025",status:"Received",pallets:5,weight:"3.12 t",pb:"1,873 kg",confirmedPallets:"5 pallets",confirmedPb:"1,861 kg",released:true,schedule:"confirmed",rows:[{pallet:"P-190",make:"EnerSys",type:"Traction · 48 V",weight:"1,120 kg",pb:"672 kg"},{pallet:"P-191",make:"Mixed",type:"VRLA · 12 V",weight:"2,000 kg",pb:"1,201 kg"}]},
  {id:"a4",ref:"IT-29320",site:"Portbury Distribution",requester:"Jo Carter",date:"12 Jun 2025",submitted:"03 Jun 2025",status:"Completed",pallets:2,weight:"0.96 t",pb:"574 kg",confirmedPallets:"2 pallets",confirmedPb:"569 kg",released:true,schedule:"confirmed",rows:[{pallet:"P-182",make:"Yuasa",type:"VRLA · 12 V",weight:"506 kg",pb:"302 kg"},{pallet:"P-183",make:"Exide",type:"Traction · 48 V",weight:"454 kg",pb:"267 kg"}]},
  {id:"a5",ref:"IT-29288",site:"North Quay Depot",requester:"Nina Shaw",date:"08 Jun 2025",submitted:"29 May 2025",status:"Confirmed",pallets:2,weight:"1.12 t",pb:"672 kg",confirmedPallets:"—",confirmedPb:"—",released:true,schedule:"confirmed",rows:[{pallet:"P-176",make:"Crown",type:"Traction · 24 V",weight:"1,120 kg",pb:"672 kg"}]},
];
const seedRequests:Request[]=[
  {id:"r1",jobId:"a1",kind:"amendment",status:"Pending",requester:"Nina Shaw",created:"Today · 09:14",note:"Please change the site access window to 10:00–14:00. The south gate is closed for maintenance."},
  {id:"r2",jobId:"a2",kind:"cancellation",status:"Pending",requester:"Leon Morris",created:"Today · 08:42",note:"Project postponed. Please cancel the collection planned for 27 June."},
  {id:"r3",jobId:"a3",kind:"transport_exception",status:"Pending",requester:"Asha Patel · CBL",created:"Yesterday · 16:20",note:"Two pallets were held at the loading bay for 45 minutes while access was cleared. No job status change requested."},
  {id:"r4",jobId:"a4",kind:"amendment",status:"Pending",requester:"Jo Carter",created:"12 Jun · 11:05",note:"Please update the battery count to match the signed collection sheet."},
];
const kindLabel:Record<RequestKind,string>={amendment:"Customer amendment",cancellation:"Cancellation request",transport_exception:"Transport exception"};

export default function Admin(){
  const [page,setPage]=useState<"queue"|"jobs"|"detail"|"history">("queue");
  const [jobs,setJobs]=useState(seedJobs);
  const [requests,setRequests]=useState(seedRequests);
  const [selectedId,setSelectedId]=useState("a1");
  const [tab,setTab]=useState("Pending");
  const [search,setSearch]=useState("");
  const [kindFilter,setKindFilter]=useState("All requests");
  const [decision,setDecision]=useState<{request:Request;status:"Approved"|"Rejected"}|null>(null);
  const [decisionNote,setDecisionNote]=useState("");
  const [notice,setNotice]=useState("");
  const [reviewStep,setReviewStep]=useState<"release"|"date"|"">("");
  const [ackProvisional,setAckProvisional]=useState(false);
  const [releaseNote,setReleaseNote]=useState("");
  const [dateConfirmed,setDateConfirmed]=useState(false);
  const [financeOpen,setFinanceOpen]=useState(false);
  const [officialEdit,setOfficialEdit]=useState("");
  const [confirmedPalletInput,setConfirmedPalletInput]=useState("");
  const [confirmedPbInput,setConfirmedPbInput]=useState("");
  const [resolvedProvisional,setResolvedProvisional]=useState(false);
  const [history,setHistory]=useState<string[]>([]);
  const selected=jobs.find(j=>j.id===selectedId)??jobs[0];
  const pendingCount=requests.filter(r=>r.status==="Pending").length;
  const queue=useMemo(()=>requests.filter(r=>(tab==="All"||r.status===tab)&&(kindFilter==="All requests"||r.kind===kindFilter)&&(`${r.note} ${r.requester} ${jobs.find(j=>j.id===r.jobId)?.ref}`).toLowerCase().includes(search.toLowerCase())),[requests,tab,kindFilter,search,jobs]);
  const filteredJobs=useMemo(()=>jobs.filter(j=>`${j.ref} ${j.site} ${j.status}`.toLowerCase().includes(search.toLowerCase())),[jobs,search]);
  const canAct=(request:Request)=>{const j=jobs.find(x=>x.id===request.jobId);return request.kind==="transport_exception"||!!j&&["Requested","Confirmed"].includes(j.status);};
  function openJob(id:string){setSelectedId(id);setPage("detail");setNotice("");setReviewStep("");setFinanceOpen(false);setConfirmedPalletInput("");setConfirmedPbInput("");setResolvedProvisional(false);setAckProvisional(false);setReleaseNote("");setOfficialEdit("");}
  function decideRequest(){
    if(!decision||!decisionNote.trim())return;
    const {request,status}=decision;
    setRequests(prev=>prev.map(r=>r.id===request.id?{...r,status,decisionNote:decisionNote.trim()}:r));
    if(status==="Approved"&&request.kind==="cancellation")setJobs(prev=>prev.map(j=>j.id===request.jobId?{...j,status:"Cancelled"}:j));
    const effect=status==="Rejected"?"request rejected; job unchanged":request.kind==="amendment"?"decision recorded only; official job details unchanged":request.kind==="cancellation"?"job status set to Cancelled":"exception decision recorded; job status unchanged";
    setHistory(prev=>[`${kindLabel[request.kind]} · ${status} · ${jobs.find(j=>j.id===request.jobId)?.ref} · ${effect}`,...prev]);
    setDecision(null);setDecisionNote("");setNotice(`${status}. ${effect[0].toUpperCase()+effect.slice(1)}. Local preview only.`);
  }
  function releaseJob(){
    if(selected.released||!["Requested","Confirmed"].includes(selected.status))return;
    if(selected.provisional&&(!ackProvisional||!releaseNote.trim()))return;
    if(Number.parseFloat(selected.weight.replace(",",""))>26)return;
    setJobs(prev=>prev.map(j=>j.id===selected.id?{...j,released:true}:j));
    setHistory(prev=>[`Collection released to collector · ${selected.ref}${releaseNote?` · ${releaseNote}`:""}`,...prev]);
    setReviewStep("");setNotice(`${selected.ref} released to the collector in this local preview. Release does not confirm a date or receipt.`);
  }
  function confirmDate(){
    if(!dateConfirmed||!selected.released||selected.schedule!=="proposed"||!["Requested","Confirmed"].includes(selected.status))return;
    setJobs(prev=>prev.map(j=>j.id===selected.id?{...j,schedule:"confirmed",date:j.proposedDate||j.date,status:"Confirmed"}:j));
    setHistory(prev=>[`Date confirmed with customer · ${selected.ref} · ${selected.proposedDate}`,...prev]);
    setReviewStep("");setDateConfirmed(false);setNotice("Collection date confirmed after customer confirmation. Release and receipt remain separate.");
  }
  function acknowledgeReceipt(){
    const count=Number(confirmedPalletInput),pb=Number(confirmedPbInput);
    if(!selected.released||selected.schedule!=="confirmed"||selected.status!=="Confirmed"||
      !Number.isFinite(count)||!Number.isInteger(count)||count<1||count>selected.pallets||
      !Number.isFinite(pb)||pb<=0||pb>26000||
      (selected.rows.some(r=>r.provisional)&&!resolvedProvisional)){
      setNotice("Receipt needs a released, date-confirmed Confirmed job, valid actual totals and resolved provisional rows.");return;
    }
    setJobs(prev=>prev.map(j=>j.id===selected.id?{...j,status:"Received",confirmedPallets:`${count} ${count===1?"pallet":"pallets"}`,confirmedPb:`${pb.toLocaleString()} kg`}:j));
    setHistory(prev=>[`Receipt confirmed · ${selected.ref} · ${count} pallets · ${pb.toLocaleString()} kg Pb`,...prev]);
    setNotice("Receipt confirmed in this local preview. Estimated submission values remain distinct from confirmed receipt totals.");
  }
  const statusClass=(status:JobStatus)=>status==="Completed"?"green":status==="Requested"?"amber":status==="Received"?"neutral":status==="Cancelled"?"neutral":"";
  return <div className="it-mobile im-admin">
    <header className="im-header"><div className="im-brand"><span className="im-mark">i</span><div className="im-wordmark">itinium<small>Operations desk</small></div></div><span className="im-concept">Concept · local demo</span></header>
    <main className="im-scroll">
      <div className="im-scope"><ShieldCheck size={13}/><span>Administrator workspace <strong>· internal preview</strong></span></div>
      {page==="queue"&&<>
        <p className="im-eyebrow" style={{marginTop:20}}>Depot operations · 19 June</p><h1 className="im-title">Action queue</h1>
        <p className="im-subtitle">Review what needs a decision. Collection release, date confirmation and receipt are separate steps.</p>
        <div className="im-admin-metrics"><div><strong>{pendingCount}</strong><span>pending decisions</span></div><div><strong>{jobs.filter(j=>!j.released&&j.status!=="Cancelled").length}</strong><span>awaiting release</span></div></div>
        <div className="im-admin-shortcuts">
          <button onClick={()=>{setPage("jobs");setSearch("");}}><Package size={16}/>Collection review <b>{jobs.filter(j=>!j.released&&j.status!=="Cancelled").length}</b><ChevronRight size={15}/></button>
          <button onClick={()=>{setPage("history");}}><Clock3 size={16}/>Decision history<ChevronRight size={15}/></button>
        </div>
        <div className="im-admin-search"><Search size={15}/><input aria-label="Search requests" placeholder="Search reference, requester or note" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        <div className="im-switch">{["Pending","Approved","Rejected","All"].map(v=><button key={v} className={tab===v?"on":""} onClick={()=>setTab(v)}>{v}{v==="Pending"?` · ${pendingCount}`:""}</button>)}</div>
        <div className="im-admin-filter"><label htmlFor="kind-filter">Request type</label><select id="kind-filter" value={kindFilter} onChange={e=>setKindFilter(e.target.value)}><option>All requests</option><option value="amendment">Customer amendment</option><option value="cancellation">Cancellation</option><option value="transport_exception">Transport exception</option></select></div>
        {queue.length?queue.map(r=>{
          const job=jobs.find(j=>j.id===r.jobId)!;const stale=!canAct(r);
          return <article className="im-card im-admin-request" key={r.id}>
            <div className="im-jobtop"><span className="im-admin-kind">{kindLabel[r.kind]}</span><span className={`im-status ${r.status==="Pending"?"amber":r.status==="Approved"?"green":"neutral"}`}>{r.status}</span></div>
            <button className="im-admin-ref" onClick={()=>openJob(job.id)}>{job.ref}<ChevronRight size={14}/></button>
            <div className="im-admin-byline">{r.requester} · {r.created} · {job.site}</div>
            <p className="im-admin-request-note">{r.note}</p>
            <div className="im-admin-facts"><span><Package size={13}/>{job.pallets} pallets · {job.weight}</span><span><Scale size={13}/>{job.pb} Pb</span></div>
            {stale&&r.status==="Pending"&&<div className="im-notice warn" style={{marginTop:10}}>Job is {job.status}. Amendments and cancellations are unavailable from Received onward. No decision controls shown.</div>}
            {r.decisionNote&&<div className="im-admin-decision"><b>Decision notes · shared with requester</b>{r.decisionNote}</div>}
            {r.status==="Pending"&&!stale&&<div className="im-admin-actions"><button className="im-btn secondary" onClick={()=>{setDecision({request:r,status:"Rejected"});setDecisionNote("");}}>Reject</button><button className="im-btn" onClick={()=>{setDecision({request:r,status:"Approved"});setDecisionNote("");}}>Review approval <ArrowRight size={14}/></button></div>}
            <button className="im-admin-open" onClick={()=>openJob(job.id)}>Open job details <ChevronRight size={14}/></button>
          </article>;
        }):<div className="im-card im-admin-empty"><ClipboardCheck size={24}/><strong>{tab==="Pending"?"Queue is clear":"No matching requests"}</strong><p>{tab==="Pending"?"No requests are waiting for a decision.":"Try another filter or search term."}</p><button className="im-link" onClick={()=>{setTab("All");setKindFilter("All requests");setSearch("");}}>Show all requests</button></div>}
        <div className="im-notice" style={{marginTop:13}}>Concept only. Actions update fictional sample data on this screen; nothing is saved or sent.</div>
      </>}
      {page==="jobs"&&<>
        <button className="im-back" onClick={()=>setPage("queue")}><ArrowLeft size={15}/> Action queue</button><p className="im-eyebrow">Operations</p><h1 className="im-title">Collection review</h1><p className="im-subtitle">Check the pallet-first load, then release explicitly when ready.</p>
        <div className="im-admin-search"><Search size={15}/><input aria-label="Search jobs" placeholder="Find reference or depot" value={search} onChange={e=>setSearch(e.target.value)}/></div>
        {filteredJobs.map(j=><button key={j.id} className="im-card im-jobrow im-admin-jobcard" onClick={()=>openJob(j.id)}><div className="im-jobtop"><div><div className="im-ref">{j.ref}</div><div className="im-admin-byline">{j.site}</div></div><span className={`im-status ${statusClass(j.status)}`}>{j.status}</span></div><div className="im-jobmeta"><div className="im-meta"><Package size={13}/><span>Submitted load<strong>{j.pallets} pallets · {j.weight}</strong></span></div><div className="im-meta"><Scale size={13}/><span>Estimated Pb<strong>{j.pb}</strong></span></div></div><div className="im-open"><span>{j.released?"Review collection":"Needs release review"}</span><ChevronRight size={14}/></div></button>)}
        {!filteredJobs.length&&<div className="im-card im-admin-empty"><strong>No matching jobs</strong><button className="im-link" onClick={()=>setSearch("")}>Clear search</button></div>}
      </>}
      {page==="detail"&&selected&&<>
        <button className="im-back" onClick={()=>{setPage("jobs");setReviewStep("");}}><ArrowLeft size={15}/> Collection review</button>
        <div className="im-card im-detail-hero"><div className="im-jobtop"><div><p className="im-eyebrow" style={{marginBottom:4}}>Operational job</p><h1 className="im-title" style={{fontSize:22}}>{selected.ref}</h1></div><span className={`im-status ${statusClass(selected.status)}`}>{selected.status}</span></div>
          <div className="im-detail-facts"><Fact icon={<MapPin size={13}/>} label="Depot" value={selected.site}/><Fact icon={<Clock3 size={13}/>} label={selected.schedule==="proposed"?"Collector proposal":"Collection date"} value={selected.schedule==="proposed"?selected.proposedDate||"Proposed":selected.date}/><Fact icon={<Package size={13}/>} label="Submitted estimate" value={`${selected.pallets} pallets · ${selected.weight}`}/><Fact icon={<Scale size={13}/>} label="Estimated Pb" value={selected.pb}/></div>
          <p className="im-admin-byline">Submitted {selected.submitted} by {selected.requester} · {selected.released?"Released to collector":"Not released to collector"}</p>
        </div>
        <div className="im-section-head"><h2>Load review</h2><span className="im-admin-count">{selected.rows.length} pallets / lines</span></div>
        {selected.rows.map((row,i)=><div className="im-pallet im-admin-pallet" key={`${row.pallet}-${i}`}><div className="im-pallet-id">{row.pallet}{row.provisional&&<span className="im-admin-provisional">PROVISIONAL</span>}</div><h3>{row.make} · {row.type}</h3><div className="im-pallet-grid"><span>Estimated weight<strong>{row.weight}</strong></span><span>Estimated Pb<strong>{row.pb}</strong></span></div>{row.note&&<p className="im-admin-note"><AlertTriangle size={13}/>{row.note}</p>}</div>)}
        <div className="im-admin-receipt"><b>Receipt confirmation · separate stage</b><span>Confirmed count: {selected.confirmedPallets}</span><span>Confirmed Pb: {selected.confirmedPb}</span>
          {selected.status==="Confirmed"&&selected.released&&selected.schedule==="confirmed"&&<><p>Enter the actual count and resolved Pb after collection. These confirmed totals remain separate from the submitted estimate.</p>
            <div className="im-admin-receipt-inputs"><label>Confirmed pallets<input aria-label="Confirmed pallet count" type="number" min="1" max={selected.pallets} value={confirmedPalletInput} onChange={e=>setConfirmedPalletInput(e.target.value)} placeholder={`Up to ${selected.pallets}`}/></label><label>Confirmed Pb · kg<input aria-label="Confirmed Pb kilograms" type="number" min="1" max="26000" value={confirmedPbInput} onChange={e=>setConfirmedPbInput(e.target.value)} placeholder="Resolved total"/></label></div>
            {selected.rows.some(r=>r.provisional)&&<><small>Provisional rows cannot be confirmed as received until identified and actual weights are resolved. Include only resolved Pb in the confirmed total.</small><label><input type="checkbox" checked={resolvedProvisional} onChange={e=>setResolvedProvisional(e.target.checked)}/> I identified provisional items and entered their actual weights.</label></>}
            <button className="im-btn secondary" disabled={!confirmedPalletInput||!confirmedPbInput||(selected.rows.some(r=>r.provisional)&&!resolvedProvisional)} onClick={acknowledgeReceipt}>Preview receipt confirmation</button></>}
          {selected.status==="Confirmed"&&selected.released&&selected.schedule!=="confirmed"&&<small>Receipt confirmation is available after the collection date is confirmed and the load is received.</small>}
        </div>
        {selected.provisional&&<div className="im-notice warn" style={{marginTop:11}}><strong>{selected.released?"Provisional load · check at collection":"Provisional load · acknowledge before release"}</strong><br/>{selected.provisional}</div>}
        {selected.released&&selected.schedule==="proposed"&&["Requested","Confirmed"].includes(selected.status)&&<div className="im-card im-admin-flow" style={{marginTop:11}}><p className="im-eyebrow">Collector date proposal</p><strong>{selected.proposedDate} · {selected.driver} · {selected.vehicle}</strong><p className="im-subtitle">Confirm with the customer before confirming this date. This is not collection release or receipt.</p>
          {reviewStep!=="date"?<button className="im-btn secondary" style={{marginTop:12}} onClick={()=>{setReviewStep("date");setDateConfirmed(false);}}>Review customer confirmation</button>:<div className="im-admin-confirm-step"><label><input type="checkbox" checked={dateConfirmed} onChange={e=>setDateConfirmed(e.target.checked)}/> I have confirmed this proposed date with {selected.requester}.</label><div className="im-notice">Confirming records the official date and customer notification in this local concept. Collector submission remains a separate action.</div><button className="im-btn" disabled={!dateConfirmed} onClick={confirmDate}><Check size={14}/> Confirm date</button><button className="im-btn quiet" onClick={()=>setReviewStep("")}>Cancel</button></div>}
        </div>}
        <div className="im-section-head"><h2>Collection release</h2></div>
        {selected.released?<div className="im-notice">Released to the assigned collector. Release does not confirm proposed date or receipt.</div>:selected.status==="Cancelled"?<div className="im-notice warn">Cancelled jobs cannot be released.</div>:<div className="im-card im-admin-flow">
          <p className="im-subtitle" style={{margin:0}}>Collector visibility starts only after explicit submission. Review saved details, pallet IDs and load totals first. Hard limit: 26 t.</p>
          {Number.parseFloat(selected.weight.replace(",",""))>26&&<div className="im-notice warn" style={{marginTop:10}}>This load exceeds the 26 t maximum and cannot be released.</div>}
          {reviewStep!=="release"?<button className="im-btn" style={{marginTop:12}} disabled={Number.parseFloat(selected.weight.replace(",",""))>26} onClick={()=>setReviewStep("release")}><Truck size={15}/> Review before release</button>:<div className="im-admin-confirm-step">
            <div className="im-notice warn">Confirm review of collection details and pallet numbers. This will make the job visible to the collector; it will not confirm a date or receipt.</div>
            {selected.provisional&&<label><input type="checkbox" checked={ackProvisional} onChange={e=>setAckProvisional(e.target.checked)}/> I acknowledge this provisional weight for release.</label>}
            {selected.provisional&&<div className="im-field"><label htmlFor="release-note">Itinium warning note for collector · required</label><textarea id="release-note" placeholder="What must be identified or checked at collection?" value={releaseNote} onChange={e=>setReleaseNote(e.target.value)}/></div>}
            <button className="im-btn" disabled={(!!selected.provisional&&(!ackProvisional||!releaseNote.trim()))||Number.parseFloat(selected.weight.replace(",",""))>26} onClick={releaseJob}><Check size={14}/> Submit for collection</button>
            <button className="im-btn quiet" onClick={()=>setReviewStep("")}>Cancel review</button>
          </div>}
        </div>}
        <div className="im-section-head"><h2>Internal finance</h2></div><div className="im-card im-admin-finance"><button onClick={()=>setFinanceOpen(!financeOpen)} aria-expanded={financeOpen}><span>Restricted · Itinium only</span><span>{financeOpen?"Hide":"View sample"}<ChevronRight size={14}/></span></button>{financeOpen&&<div className="im-admin-finance-data"><div><span>Customer Pb estimate</span><b>{selected.pb}</b></div><div><span>Internal CBL cost sample</span><b>£412.80</b></div><div><span>Internal margin sample</span><b>£186.40</b></div><small>Fictional read-only sample. No finance controls or calculations.</small></div>}</div>
        <div className="im-section-head"><h2>Related requests</h2></div>{requests.filter(r=>r.jobId===selected.id).map(r=><div className="im-card im-admin-related" key={r.id}><div className="im-jobtop"><b>{kindLabel[r.kind]}</b><span className={`im-status ${r.status==="Pending"?"amber":r.status==="Approved"?"green":"neutral"}`}>{r.status}</span></div><p>{r.note}</p>{r.decisionNote&&<small>Decision notes: {r.decisionNote}</small>}{r.status==="Pending"&&canAct(r)&&<button className="im-btn secondary" onClick={()=>{setDecision({request:r,status:"Approved"});setDecisionNote("");}}>Review request</button>}{r.kind==="amendment"&&r.status==="Approved"&&<div className="im-admin-official-edit"><strong>Separate official job edit</strong><p>Approval recorded only. Make any accepted operational change here as a distinct local sample action.</p><label htmlFor="official-job-edit">Official change note</label><textarea id="official-job-edit" value={officialEdit} onChange={e=>setOfficialEdit(e.target.value)} placeholder="Describe the job detail to update"/><button className="im-btn secondary" disabled={!officialEdit.trim()} onClick={()=>{setHistory(prev=>[`Official job edit preview · ${selected.ref} · ${officialEdit.trim()}`,...prev]);setNotice("Separate official job edit recorded in local preview. No real job data changed.");setOfficialEdit("");}}>Preview official job edit</button></div>}</div>)}
      </>}
      {page==="history"&&<><button className="im-back" onClick={()=>setPage("queue")}><ArrowLeft size={15}/> Action queue</button><p className="im-eyebrow">Local activity</p><h1 className="im-title">Decision history</h1><p className="im-subtitle">Actions taken during this concept preview.</p>{history.length?history.map((item,i)=><div className="im-card im-admin-history" key={`${item}-${i}`}><Check size={15}/><span>{item}</span></div>):<div className="im-card im-admin-empty"><Clock3 size={22}/><strong>No local decisions yet</strong><p>Review an action or collection to see sample history here.</p></div>}</>}
      {notice&&<div className="im-toast" role="status">{notice}</div>}
    </main>
    <nav className="im-nav" aria-label="Administrator navigation"><Nav active={page==="queue"||page==="history"} label="Actions" icon={<ClipboardCheck size={18}/>} onClick={()=>setPage("queue")}/><Nav active={page==="jobs"||page==="detail"} label="Jobs" icon={<Package size={18}/>} onClick={()=>{setPage("jobs");setSearch("");}}/><Nav active={page==="history"} label="History" icon={<Clock3 size={18}/>} onClick={()=>setPage("history")}/></nav>
    {decision&&<div className="im-admin-modal-backdrop" role="presentation"><section className="im-admin-modal" role="dialog" aria-modal="true" aria-labelledby="decision-heading">
      <button className="im-admin-modal-close" aria-label="Close review" onClick={()=>setDecision(null)}><X size={18}/></button>
      <p className="im-eyebrow">Decision review · {jobs.find(j=>j.id===decision.request.jobId)?.ref}</p><h2 id="decision-heading">{decision.status} {kindLabel[decision.request.kind].toLowerCase()}?</h2>
      {decision.status==="Approved"&&<div className="im-notice warn"><strong>Before you confirm</strong><br/>{decision.request.kind==="amendment"?"Approval records the decision only. It does not edit the job. Make any official changes separately with job edit tools.":decision.request.kind==="cancellation"?"Approval will set this job status to Cancelled.":"Approval records the exception only. The job status will not change."}</div>}
      {decision.status==="Rejected"&&<div className="im-notice">Rejecting records your decision. The job status and operational details remain unchanged.</div>}
      <label className="im-field im-admin-decision-label"><span>Decision notes · required · shared with requester</span><textarea value={decisionNote} onChange={e=>setDecisionNote(e.target.value)} placeholder="Add a clear note for the requester"/></label>
      {!decisionNote.trim()&&<small className="im-admin-required">A decision note is required before confirmation.</small>}
      <div className="im-admin-modal-actions"><button className="im-btn quiet" onClick={()=>setDecision(null)}>Go back</button><button className="im-btn" disabled={!decisionNote.trim()} onClick={decideRequest}>Confirm {decision.status.toLowerCase()}</button></div>
      <p className="im-admin-modal-foot">Local sample action only · nothing is sent or saved.</p>
    </section></div>}
  </div>;
}
function Fact({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <div className="im-admin-fact"><span>{icon}</span><div><small>{label}</small><b>{value}</b></div></div>}
function Nav({active,label,icon,onClick}:{active:boolean;label:string;icon:React.ReactNode;onClick:()=>void}){return <button className={active?"active":""} aria-current={active?"page":undefined} onClick={onClick}>{icon}{label}</button>}
