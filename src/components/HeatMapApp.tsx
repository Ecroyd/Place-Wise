"use client";
import {useCallback,useState} from "react";
import {GoogleAreaMap} from "./GoogleAreaMap";
import type {LocationScore,OptimisationMode,SearchCriteria,TransportMode} from "@/src/types/domain";

const prompt="I work in Middleton five days a week. We have a £1 million budget and I don't want more than about 35 minutes to work.";
const money=(n:number)=>new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0,notation:n>=1e6?"compact":"standard"}).format(n);
const colour=(n:number)=>n>=88?"#7fbd62":n>=84?"#b9d86f":n>=80?"#e2cd74":"#d99564";

export function HeatMapApp(){
 const [mode,setMode]=useState<OptimisationMode>("live");
 const [inputMode,setInputMode]=useState<"ai"|"manual">("ai");
 const [text,setText]=useState(prompt);
 const [results,setResults]=useState<LocationScore[]>([]);
 const [focused,setFocused]=useState<string>();
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState<string>();
 const [budget,setBudget]=useState(1e6);
 const [destination,setDestination]=useState("Middleton");
 const [distance,setDistance]=useState(40);
 const [minimumTravel,setMinimumTravel]=useState(10);
 const [maximumTravel,setMaximumTravel]=useState(60);
 const [journeys,setJourneys]=useState(5);
 const [transport,setTransport]=useState<TransportMode>("drive");
 const select=useCallback((id:string)=>setFocused(id),[]);

 async function run(){
  setLoading(true);setError(undefined);
  try{
   const parse=await fetch("/api/criteria/parse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:inputMode==="ai"?text:`${destination} ${journeys} days, ${maximumTravel} minutes, £${budget} budget`})});
   const parsed=await parse.json() as SearchCriteria&{error?:string};
   if(!parse.ok)throw new Error(parsed.error??"Could not understand that search");
   parsed.mode=mode;
   if(inputMode==="manual"){
    const lookup=await fetch("/api/geocode",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({address:destination})});
    const place=await lookup.json() as {label?:string;latitude?:number;longitude?:number;error?:string};
    if(!lookup.ok||place.latitude===undefined||place.longitude===undefined)throw new Error(place.error??"Destination not found");
    parsed.destinations=[{id:`destination:${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}`,label:place.label??destination,purpose:"Main destination",latitude:place.latitude,longitude:place.longitude,journeysPerWeek:journeys,minimumMinutes:minimumTravel,preferredMinutes:maximumTravel,maximumMinutes:maximumTravel,maximumDistanceKm:distance,transportMode:transport,weight:100,hardMaximum:true}];
    parsed.property={maximumBudget:budget,hardBudget:false};
    parsed.lifestyle=[];
   }
   const response=await fetch("/api/optimise",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(parsed)});
   const payload=await response.json() as LocationScore[]|{error:string};
   if(!response.ok||!Array.isArray(payload))throw new Error(!Array.isArray(payload)?payload.error:"Optimisation failed");
   setResults(payload);
  }catch(cause){setError(cause instanceof Error?cause.message:"Optimisation failed")}
  finally{setLoading(false)}
 }

 if(results.length)return <Results results={results} focused={focused} select={select} edit={()=>setResults([])}/>;
 return <main className="shell"><Nav/><section className="hero">
  <span className="eyebrow">Area recommendations, made personal</span>
  <h1 className="serif">Where does your life<br/><em>fit best?</em></h1>
  <p className="sub">Compare real journey times and historical prices on one geographic suitability map.</p>
  <div className="mode-switch"><button className={mode==="live"?"active":""} onClick={()=>setMode("live")}>Where should I live?</button><button className={mode==="work"?"active":""} onClick={()=>setMode("work")}>Where should I work?</button></div>
  <div className="search-card">
   <div className="input-tabs"><button className={inputMode==="ai"?"active":""} onClick={()=>setInputMode("ai")}>✦ Describe your ideal area</button><button className={inputMode==="manual"?"active":""} onClick={()=>setInputMode("manual")}>Adjust priorities</button></div>
   {inputMode==="ai"?<textarea className="prompt" value={text} onChange={event=>setText(event.target.value)} aria-label="Describe your ideal area"/>:<div className="manual">
    <Field id="destination" label="Main destination"><input id="destination" value={destination} onChange={event=>setDestination(event.target.value)} placeholder="Town, postcode or address"/></Field>
    <Field id="transport" label="Travel mode"><select id="transport" value={transport} onChange={event=>setTransport(event.target.value as TransportMode)}><option value="drive">Drive</option><option value="transit">Public transport</option><option value="cycle">Cycle</option><option value="walk">Walk</option></select></Field>
    <Field id="budget" label="Maximum budget"><input id="budget" type="number" min="50000" step="10000" value={budget} onChange={event=>setBudget(Number(event.target.value))}/></Field>
    <Slider id="distance" label="Maximum distance" value={distance} min={5} max={100} suffix="km" set={setDistance}/>
    <Slider id="minimum-travel" label="Minimum travel time" value={minimumTravel} min={0} max={Math.max(0,maximumTravel-5)} suffix=" min" set={setMinimumTravel}/>
    <Slider id="maximum-travel" label="Maximum travel time" value={maximumTravel} min={Math.max(5,minimumTravel+5)} max={120} suffix=" min" set={setMaximumTravel}/>
    <Slider id="journeys" label="Journeys per week" value={journeys} min={1} max={7} suffix="" set={setJourneys}/>
   </div>}
   <div className="prompt-foot"><small>Live road routes · HM Land Registry UK HPI, June 2026</small><button className="go" onClick={run} disabled={loading}>{loading?"Checking live data…":"Show my heat map"}<span>→</span></button></div>
   {error&&<p className="demo-note" role="alert">{error}</p>}
  </div>
  <p className="demo-note">Current coverage: ten Greater Manchester borough centres. Prices are local-authority averages, not listings or valuations.</p>
 </section><section className="proof"><div><b>Live road routing</b>OSRM-calculated journey durations on OpenStreetMap roads.</div><div><b>Official price history</b>June 2026 UK HPI averages from HM Land Registry.</div><div><b>Transparent scoring</b>Recommendations currently use commute and affordability only.</div></section></main>;
}

function Results({results,focused,select,edit}:{results:LocationScore[];focused?:string;select:(id:string)=>void;edit:()=>void}){
 const active=results.find(result=>result.h3Index===focused)??results[0];
 return <main className="workspace"><Nav/><section className="result-head"><div><span className="eyebrow">Your live suitability map</span><h1 className="serif">Best areas for your life</h1></div><button className="btn light" onClick={edit}>Edit priorities</button></section><div className="heat-layout"><section className="heat-map google"><GoogleAreaMap results={results} activeId={active.h3Index} onSelect={select}/><div className="heat-legend"><b>AREA FIT</b><span><i style={{background:"#7fbd62"}}/>Excellent</span><span><i style={{background:"#b9d86f"}}/>Good</span><span><i style={{background:"#e2cd74"}}/>Compromise</span></div><div className="heat-callout"><span className="eyebrow">Selected borough</span><h2>{active.town}</h2><b>{active.overallScore}/100 · {money(active.typicalHousePrice)} historical average</b><p>Road route {active.destinationResults[0]?.minutes} min · Affordability {active.components.affordability}/100</p></div></section><aside className="area-list"><div className="area-intro"><b>Ranked boroughs</b><span>Official area averages, not listings.</span></div>{results.slice(0,10).map((result,index)=><button className={`area-card area-button ${active.h3Index===result.h3Index?"selected":""}`} key={result.h3Index} onClick={()=>select(result.h3Index)}><span className="area-rank">{index+1}</span><span className="area-copy"><strong>{result.town}</strong><span className="area-metrics"><span>Route <b>{result.destinationResults[0]?.minutes} min</b></span><span>HPI average <b>{money(result.typicalHousePrice)}</b></span><span>Affordability <b>{result.components.affordability}</b></span></span><small>{result.positives[0]??result.compromises[0]}</small></span><span className="area-score" style={{background:colour(result.overallScore)}}>{result.overallScore}</span></button>)}</aside></div><footer className="demo-note">Contains HM Land Registry data © Crown copyright and database right 2021. Licensed under the Open Government Licence v3.0. Map © OpenStreetMap contributors.</footer></main>
}
function Field({id,label,children}:{id:string;label:string;children:React.ReactNode}){return <div className="field"><label htmlFor={id}>{label}</label>{children}</div>}
function Slider({id,label,value,min,max,suffix,set}:{id:string;label:string;value:number;min:number;max:number;suffix:string;set:(value:number)=>void}){return <div className="range"><div className="range-head"><label htmlFor={id}>{label}</label><b>{value}{suffix}</b></div><input id={id} aria-label={label} type="range" min={min} max={max} value={value} onChange={event=>set(Number(event.target.value))}/></div>}
function Nav(){return <nav className="nav"><div className="brand"><span className="brandmark"/>placewise</div><div className="nav-actions"><button className="btn">How it works</button><button className="btn">My areas</button><button className="btn primary">Sign in</button></div></nav>}
