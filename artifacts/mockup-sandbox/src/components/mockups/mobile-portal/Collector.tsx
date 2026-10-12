import "./_group.css";
import { useMemo, useState } from "react";
import {
  AlertTriangle, ArrowLeft, ArrowRight, CalendarDays, Check, ChevronRight,
  Clock3, FileText, MapPin, Package, Phone, ShieldCheck, Truck, UserRound,
} from "lucide-react";
import type { ReactNode } from "react";

type Stage = "Needs scheduling" | "Date proposed" | "Collected" | "Completed";
type Collection = {
  id:string; ref:string; client:string; site:string; address:string; date:string; weight:string;
  pallets:number; status:Stage; jobStatus:"Requested"|"Confirmed"|"Received"|"Completed";
  schedule:"Unassigned"|"Proposed"|"Confirmed"; vehicle:string; driver:string; hours:string;
  contact:string; instructions:string; provisional?:string;
};
const seedCollections:Collection[] = [
  {id:"c1",ref:"IT-29604",client:"Northline Logistics",site:"North Quay Depot",address:"Pier 4, 18 Dock Road, Bristol BS1 4RN",date:"Proposed · 24 Jun",weight:"2.36 t",pallets:4,status:"Date proposed",jobStatus:"Confirmed",schedule:"Proposed",vehicle:"YK24 RCU",driver:"Asha Patel",hours:"07:30–16:00",contact:"Nina Shaw · 0117 555 0184",instructions:"Use the south gate. Ask for the stores team on arrival.",provisional:"Pallet P-208 · unknown traction pack, identify at collection."},
  {id:"c2",ref:"IT-29571",client:"Harbour Cold Storage",site:"Avonmouth Works",address:"Unit 7, Severn Road, Avonmouth BS11 9EQ",date:"Not yet set",weight:"1.84 t",pallets:3,status:"Needs scheduling",jobStatus:"Requested",schedule:"Unassigned",vehicle:"",driver:"",hours:"08:00–15:30",contact:"Leon Morris · 0117 555 0249",instructions:"Report to the security cabin; bring hi-vis and safety footwear."},
  {id:"c3",ref:"IT-29498",client:"Northline Logistics",site:"East Yard",address:"Warehouse 2, East Yard, Bristol BS2 0AA",date:"19 Jun 2025",weight:"3.12 t",pallets:5,status:"Collected",jobStatus:"Received",schedule:"Confirmed",vehicle:"YK24 RCU",driver:"Asha Patel",hours:"07:00–17:00",contact:"Nina Shaw · 0117 555 0184",instructions:"Collections at loading bay 3."},
  {id:"c4",ref:"IT-29320",client:"Morrow Foods",site:"Portbury Distribution",address:"Gate 6, Marsh Lane, Portbury BS20 7XN",date:"12 Jun 2025",weight:"0.96 t",pallets:2,status:"Completed",jobStatus:"Completed",schedule:"Confirmed",vehicle:"WR23 LKS",driver:"Daniel Reed",hours:"08:00–16:00",contact:"Jo Carter · 01275 555 0167",instructions:"Use visitor entrance and sign in with reception."},
];
const vehicleOptions=["YK24 RCU · 18t curtainsider","WR23 LKS · 12t rigid","BX22 TNP · 7.5t box"];
const driverOptions=["Asha Patel","Daniel Reed","Marta Evans"];

export default function Collector() {
  const [page,setPage]=useState<"list"|"detail">("list");
  const [collections,setCollections]=useState(seedCollections);
  const [selectedId,setSelectedId]=useState("c1");
  const [filter,setFilter]=useState("All");
  const [vehicle,setVehicle]=useState(vehicleOptions[0]);
  const [driver,setDriver]=useState(driverOptions[0]);
  const [proposedDate,setProposedDate]=useState("2025-06-24");
  const [showSchedule,setShowSchedule]=useState(false);
  const [showException,setShowException]=useState(false);
  const [exceptionType,setExceptionType]=useState("Access issue");
  const [exceptionText,setExceptionText]=useState("");
  const [notice,setNotice]=useState("");
  const selected=collections.find((collection)=>collection.id===selectedId)??collections[0];
  const list=useMemo(()=>collections.filter((item)=>filter==="All"||item.status===filter),[collections,filter]);

  function open(collection:Collection) {
    setSelectedId(collection.id);setVehicle(vehicleOptions[0]);setDriver(driverOptions[0]);
    setProposedDate(collection.schedule==="Proposed"?"2025-06-24":"2025-06-26");
    setPage("detail");setNotice("");setShowSchedule(false);setShowException(false);
  }
  function localSchedule() {
    if(!vehicle||!driver||!proposedDate){setNotice("Choose a vehicle, driver and proposed collection date.");return;}
    const updated=collections.map((item)=>item.id===selected.id?{...item,vehicle:vehicle.split(" · ")[0],driver,date:`Proposed · ${new Date(`${proposedDate}T12:00:00`).toLocaleDateString("en-GB",{day:"numeric",month:"short"})}`,schedule:"Proposed" as const,status:"Date proposed" as const}:item);
    setCollections(updated);setShowSchedule(false);
    setNotice("Schedule proposal previewed locally. Itinium must confirm the date; nothing was saved or sent.");
  }
  function localException() {
    if(!exceptionText.trim()){setNotice("Add a short note before previewing the exception.");return;}
    setNotice(`Preview only · ${exceptionType} noted for ${selected.ref}. No report was sent or saved.`);
    setShowException(false);setExceptionText("");
  }
  function classFor(stage:Stage) {
    if(stage==="Needs scheduling")return "amber";
    if(stage==="Completed")return "green";
    if(stage==="Collected")return "neutral";
    return "";
  }
  const canPropose=["Requested","Confirmed"].includes(selected.jobStatus);
  const collected=["Received","Completed"].includes(selected.jobStatus);

  return <div className="it-mobile">
    <header className="im-header">
      <div className="im-brand"><span className="im-mark">i</span><div className="im-wordmark">itinium<small>Collection partner</small></div></div>
      <span className="im-concept">Concept · local demo</span>
    </header>
    <main className="im-scroll">
      <div className="im-scope"><ShieldCheck size={13}/><span>Partner view <strong>· assigned collections only</strong></span></div>
      {page==="list" ? <>
        <p className="im-eyebrow" style={{marginTop:20}}>Field operations</p>
        <h1 className="im-title">Today’s collections.</h1>
        <p className="im-subtitle">Plan the vehicle and driver, then keep site details close at hand.</p>
        <div className="im-card" style={{marginTop:16,background:"#102e49",color:"#fff",borderColor:"#102e49"}}>
          <div className="im-row"><span className="im-eyebrow" style={{color:"#90d3df",margin:0}}>Visible work</span><Truck size={16} color="#90d3df"/></div>
          <div style={{font:"800 27px Manrope",marginTop:8}}>{collections.length}<span style={{font:"500 11px 'DM Sans'",color:"#c1d1db",marginLeft:7}}>released collections</span></div>
          <div style={{fontSize:10,color:"#b9ccd8",marginTop:3}}>Unreleased customer requests are not shown.</div>
        </div>
        <div className="im-switch">{["All","Needs scheduling","Date proposed","Collected","Completed"].map((value)=><button key={value} className={filter===value?"on":""} onClick={()=>setFilter(value)}>{value==="Needs scheduling"?"To plan":value==="Date proposed"?"Proposed":value}</button>)}</div>
        {list.length ? list.map((collection)=><CollectionCard key={collection.id} item={collection} classFor={classFor} onOpen={()=>open(collection)}/>) :
          <div className="im-card" style={{textAlign:"center",padding:26}}><Truck size={25} style={{margin:"0 auto 10px",color:"#8298a6"}}/><strong>No collections in this view</strong><p className="im-subtitle">Try another filter. Only released jobs assigned to your company appear here.</p><button className="im-link" onClick={()=>setFilter("All")}>Show all collections</button></div>}
        <div className="im-notice" style={{marginTop:13}}>Itinium confirms proposed dates. Collectors cannot cancel or amend a customer job.</div>
      </> : <>
        <button className="im-back" onClick={()=>{setPage("list");setNotice("");}}><ArrowLeft size={15}/> Collections</button>
        <div className="im-card im-detail-hero">
          <div className="im-jobtop"><div><p className="im-eyebrow" style={{marginBottom:4}}>Collection reference</p><h1 className="im-title" style={{fontSize:22}}>{selected.ref}</h1></div><span className={`im-status ${classFor(selected.status)}`}>{selected.status}</span></div>
          <p style={{fontSize:11,color:"#6c8092",margin:"6px 0 0"}}>{selected.client} · {selected.site}</p>
          <div className="im-detail-facts">
            <Fact icon={<CalendarDays size={13}/>} label={selected.schedule==="Proposed"?"Proposed date":"Collection date"} value={selected.date}/>
            <Fact icon={<Package size={13}/>} label="Expected load" value={`${selected.pallets} pallets · ${selected.weight}`}/>
            <Fact icon={<Truck size={13}/>} label="Vehicle" value={selected.vehicle||"Not assigned"}/>
            <Fact icon={<UserRound size={13}/>} label="Driver" value={selected.driver||"Not assigned"}/>
          </div>
        </div>
        <div className="im-section-head"><h2>At the depot</h2></div>
        <div className="im-card">
          <InfoLine icon={<MapPin size={14}/>} label="Collection address" value={selected.address}/>
          <div className="im-divider"/>
          <InfoLine icon={<Clock3 size={14}/>} label="Site hours" value={selected.hours}/>
          <div className="im-divider"/>
          <InfoLine icon={<Phone size={14}/>} label="Site contact" value={selected.contact}/>
          <div className="im-divider"/>
          <InfoLine icon={<AlertTriangle size={14}/>} label="Site instructions" value={selected.instructions}/>
        </div>
        {selected.provisional&&<div className="im-notice warn" style={{marginTop:11}}><strong style={{display:"block",marginBottom:4}}>Provisional weight · identify on collection</strong>{selected.provisional}</div>}
        {canPropose&&<section>
          {!showSchedule ? <div className="im-card" style={{marginTop:12}}>
            <div className="im-row"><div><p className="im-eyebrow" style={{marginBottom:4}}>Scheduling</p><strong style={{fontSize:12}}>{selected.schedule==="Proposed"?"Update your proposal":"Needs a date proposal"}</strong></div><CalendarDays size={18} color="#138bb7"/></div>
            <p className="im-subtitle">Choose your own vehicle and driver. The date remains a proposal until Itinium confirms it with the customer.</p>
            <button className="im-btn" style={{marginTop:12}} onClick={()=>{setShowSchedule(true);setNotice("");}}>Propose a schedule <ArrowRight size={14}/></button>
          </div> : <div className="im-card" style={{marginTop:12}}>
            <p className="im-eyebrow">Propose schedule · preview</p>
            <div className="im-field" style={{marginTop:8}}><label htmlFor="collector-vehicle">Your vehicle</label><select id="collector-vehicle" value={vehicle} onChange={(event)=>setVehicle(event.target.value)}>{vehicleOptions.map((option)=><option key={option}>{option}</option>)}</select></div>
            <div className="im-field"><label htmlFor="collector-driver">Your driver</label><select id="collector-driver" value={driver} onChange={(event)=>setDriver(event.target.value)}>{driverOptions.map((option)=><option key={option}>{option}</option>)}</select></div>
            <div className="im-field"><label htmlFor="collector-date">Proposed collection date</label><input id="collector-date" type="date" value={proposedDate} onChange={(event)=>setProposedDate(event.target.value)}/></div>
            <div className="im-notice warn" style={{marginTop:12}}>Proposal only. You cannot confirm this date; Itinium will review and confirm with the customer.</div>
            <button className="im-btn" style={{marginTop:12}} onClick={localSchedule}><Check size={14}/> Preview schedule proposal</button>
            <button className="im-btn quiet" style={{marginTop:8}} onClick={()=>setShowSchedule(false)}>Cancel preview</button>
          </div>}
        </section>}
        {!canPropose&&!collected&&<div className="im-notice" style={{marginTop:11}}>Schedule details are read-only at this stage.</div>}
        {collected&&<section>
          <div className="im-section-head"><h2>Transport exception</h2></div>
          {!showException ? <div className="im-card"><p className="im-subtitle" style={{margin:0}}>Report a transport issue after collection. This is separate from a customer amendment or cancellation.</p>
            <button className="im-btn secondary" style={{marginTop:12}} onClick={()=>{setShowException(true);setNotice("");}}><AlertTriangle size={14}/> Record exception preview</button>
          </div> : <div className="im-card">
            <p className="im-eyebrow">Exception · preview only</p>
            <div className="im-field" style={{marginTop:8}}><label htmlFor="exception-type">Exception type</label><select id="exception-type" value={exceptionType} onChange={(event)=>setExceptionType(event.target.value)}><option>Access issue</option><option>Load discrepancy</option><option>Vehicle delay</option><option>Other transport issue</option></select></div>
            <div className="im-field"><label htmlFor="exception-note">What happened?</label><textarea id="exception-note" placeholder="Short factual note" value={exceptionText} onChange={(event)=>setExceptionText(event.target.value)}/></div>
            <button className="im-btn" style={{marginTop:12}} onClick={localException}>Preview exception report</button>
            <button className="im-btn quiet" style={{marginTop:8}} onClick={()=>setShowException(false)}>Close</button>
          </div>}
        </section>}
        {selected.jobStatus==="Completed"&&<section>
          <div className="im-section-head"><h2>Collection documents</h2></div>
          <div className="im-notice">Collector document downloads are available only when the collection is Completed.</div>
          <DocumentPreview title="Signed collection sheet" onClick={()=>setNotice("Document preview · signed collection sheet. No file is downloaded.")}/>
          <DocumentPreview title="Signed consignment note" onClick={()=>setNotice("Document preview · signed consignment note. No file is downloaded.")}/>
        </section>}
        {selected.jobStatus!=="Completed"&&<div className="im-notice" style={{marginTop:13}}>Signed document downloads appear to collectors only after Completed.</div>}
        {notice&&<div className="im-toast" role="status">{notice}</div>}
      </>}
    </main>
    <nav className="im-nav" aria-label="Collector navigation">
      <button className={page==="list"?"active":""} aria-current={page==="list"?"page":undefined} onClick={()=>{setPage("list");setNotice("");}}><Truck size={18}/>Collections</button>
    </nav>
  </div>;
}

function CollectionCard({item,classFor,onOpen}:{item:Collection;classFor:(stage:Stage)=>string;onOpen:()=>void}) {
  return <button className="im-card im-jobrow" onClick={onOpen}>
    <div className="im-jobtop"><div><div className="im-ref">{item.ref}</div><div style={{fontSize:10,color:"#718497",marginTop:3}}>{item.client} · {item.site}</div></div><span className={`im-status ${classFor(item.status)}`}>{item.status}</span></div>
    <div className="im-jobmeta"><div className="im-meta"><CalendarDays size={13}/><span>{item.schedule==="Proposed"?"Proposed date":"Collection"}<strong>{item.date}</strong></span></div><div className="im-meta"><Package size={13}/><span>Expected load<strong>{item.pallets} pallets · {item.weight}</strong></span></div></div>
    <div className="im-open"><span>Open collection brief</span><ChevronRight size={14}/></div>
  </button>;
}
function Fact({icon,label,value}:{icon:ReactNode;label:string;value:string}) {
  return <div style={{display:"flex",gap:7,alignItems:"flex-start"}}><span style={{color:"#138bb7",paddingTop:1}}>{icon}</span><span><span className="im-fact-label">{label}</span><span className="im-fact-value">{value}</span></span></div>;
}
function InfoLine({icon,label,value}:{icon:ReactNode;label:string;value:string}) {
  return <div style={{display:"flex",alignItems:"flex-start",gap:9}}><span style={{color:"#138bb7",marginTop:1}}>{icon}</span><div><span className="im-fact-label">{label}</span><div style={{fontSize:11,lineHeight:1.45,fontWeight:600}}>{value}</div></div></div>;
}
function DocumentPreview({title,onClick}:{title:string;onClick:()=>void}) {
  return <button className="im-doc" onClick={onClick}><span className="im-doc-mark"><FileText size={16}/></span><span><strong>{title}</strong><small>Completed job · preview only</small></span><ArrowRight size={14}/></button>;
}
