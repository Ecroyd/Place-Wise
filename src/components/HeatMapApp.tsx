"use client";
import {useState} from "react";
import {SearchViewProvider,useSearchView} from './SearchView';
import {defaultView} from '@/src/lib/account/view';
import {AccountMenu} from './AccountMenu';
import type {SavedCriteria} from '@/src/lib/account/searches';
import {AreaResults} from "./AreaResults";
import {RangeSlider} from "./RangeSlider";
import type {DestinationConstraint,OptimisationMode,SearchCriteria,TransportMode} from "@/src/types/domain";

const prompt="I work in Middleton five days a week. We have a £500,000 budget and I don't want more than about 35 minutes to work.";
const AI_SEARCH_ENABLED=false;

export function HeatMapApp(){return <SearchViewProvider><HeatMapContent/></SearchViewProvider>}
function HeatMapContent(){
 const {view,setView}=useSearchView();
 const [searchRevision,setSearchRevision]=useState(0);
 const [mode,setMode]=useState<OptimisationMode>("live");
 const [inputMode,setInputMode]=useState<"ai"|"manual">("manual");
 const [text,setText]=useState(prompt);
 const [destinations,setDestinations]=useState<DestinationConstraint[]>([]);
 const [loading,setLoading]=useState(false);
 const [error,setError]=useState<string>();
 const [minimumBudget,setMinimumBudget]=useState(0);
 const [budget,setBudget]=useState(500000);
 const [additional,setAdditional]=useState<{address:string;transportMode:TransportMode;minimumMinutes:number;maximumMinutes:number}[]>([]);
 const [destination,setDestination]=useState("Middleton");
 const [distance,setDistance]=useState(40);
 const [minimumDistance,setMinimumDistance]=useState(0);
 const [minimumTravel,setMinimumTravel]=useState(10);
 const [maximumTravel,setMaximumTravel]=useState(60);
 const [journeys,setJourneys]=useState(5);
 const [departureTime,setDepartureTime]=useState("");
 const [transport,setTransport]=useState<TransportMode>("drive");

 function loadSaved(saved:SavedCriteria){
  setView(saved.view??defaultView());setSearchRevision(n=>n+1);
  const first=saved.destinations[0];
  setMode(saved.mode);setMinimumBudget(saved.minimumBudget);setBudget(saved.budget);
  setDestination(first.label);setTransport(first.transportMode);setMinimumTravel(first.minimumMinutes??0);setMaximumTravel(first.maximumMinutes??first.preferredMinutes??60);
  setDistance(first.maximumDistanceKm??40);setMinimumDistance(first.minimumDistanceKm??0);setJourneys(first.journeysPerWeek);setDepartureTime(first.departureTime?new Date(new Date(first.departureTime).getTime()-new Date(first.departureTime).getTimezoneOffset()*60000).toISOString().slice(0,16):'');
  setAdditional(saved.destinations.slice(1).map(d=>({address:d.label,transportMode:d.transportMode,minimumMinutes:d.minimumMinutes??0,maximumMinutes:d.maximumMinutes??d.preferredMinutes??60})));
  setDestinations(saved.destinations);
 }
 const nav=<Nav criteria={destinations.length?{version:1,mode,destinations,minimumBudget,budget,view}:undefined} onLoad={loadSaved}/>;
 async function run(){
  setLoading(true);setError(undefined);
  try{
   if(!Number.isFinite(minimumBudget)||!Number.isFinite(budget)||minimumBudget<0||budget<=0||minimumBudget>budget)throw new Error("Enter a valid house-price range: minimum must not exceed maximum.");
   if(additional.some(d=>!d.address.trim()||d.minimumMinutes<0||!Number.isFinite(d.minimumMinutes)||!Number.isFinite(d.maximumMinutes)||d.maximumMinutes<=0||d.minimumMinutes>d.maximumMinutes))throw new Error("Check each additional destination and its travel-time range.");
   let parsed:SearchCriteria={mode,destinations:[],lifestyle:[]};
   if(AI_SEARCH_ENABLED&&inputMode==="ai"){
    const parse=await fetch("/api/criteria/parse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
    const payload=await parse.json() as SearchCriteria&{error?:string};
    if(!parse.ok)throw new Error(payload.error??"Could not understand that search");
    parsed=payload;
   }
   parsed.mode=mode;
   if(!AI_SEARCH_ENABLED||inputMode==="manual"){
    const lookup=await fetch("/api/geocode",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({address:destination})});
    const place=await lookup.json() as {label?:string;latitude?:number;longitude?:number;error?:string};
    if(!lookup.ok||place.latitude===undefined||place.longitude===undefined)throw new Error(place.error??"Destination not found");
    parsed.destinations=[{id:`destination:${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}`,label:place.label??destination,purpose:"Main destination",latitude:place.latitude,longitude:place.longitude,journeysPerWeek:journeys,minimumMinutes:minimumTravel,preferredMinutes:maximumTravel,maximumMinutes:maximumTravel,minimumDistanceKm:minimumDistance,maximumDistanceKm:distance,transportMode:transport,weight:100,hardMaximum:true}];
    const extra = await Promise.all(additional.map(async(item,index)=>{
      const response=await fetch('/api/geocode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({address:item.address})});const location=await response.json();if(!response.ok||typeof location.latitude!=='number'||typeof location.longitude!=='number')throw new Error(location.error??'Additional destination not found');
      return {...parsed.destinations[0],id:'additional:'+index+':'+location.latitude+','+location.longitude,label:location.label??item.address,latitude:location.latitude,longitude:location.longitude,transportMode:item.transportMode,minimumMinutes:item.minimumMinutes,maximumMinutes:item.maximumMinutes,preferredMinutes:item.maximumMinutes};
    }));parsed.destinations.push(...extra);
    parsed.property={maximumBudget:budget,hardBudget:false};
    parsed.lifestyle=[];
   }
   parsed.destinations=parsed.destinations.map(item=>item.transportMode==="transit"||item.transportMode==="mixed"||item.transportMode==="any"?{...item,departureTime:departureTime?new Date(departureTime).toISOString():new Date().toISOString()}:item);
   setView(defaultView());setSearchRevision(n=>n+1);setDestinations(parsed.destinations);
  }catch(cause){setError(cause instanceof Error?cause.message:"Optimisation failed")}
  finally{setLoading(false)}
 }

 if(destinations.length)return <Results key={searchRevision} destinations={destinations} budget={budget} minimumBudget={minimumBudget} edit={()=>setDestinations([])} nav={nav} onDestinationsChange={setDestinations}/>;
 return <main className="shell">{nav}<section className="hero">
  <span className="eyebrow">Area recommendations, made personal</span>
  <h1 className="serif">Where does your life<br/><em>fit best?</em></h1>
  <p className="sub">Explore a commute-time heatmap alongside area recommendations and historical prices.</p>
  <div className="mode-switch"><button className={mode==="live"?"active":""} onClick={()=>setMode("live")}>Where should I live?</button><button className={mode==="work"?"active":""} onClick={()=>setMode("work")}>Where should I work?</button></div>
  <div className="search-card">
   {AI_SEARCH_ENABLED&&<div className="input-tabs"><button className={inputMode==="ai"?"active":""} onClick={()=>setInputMode("ai")}>✦ Describe your ideal area</button><button className={inputMode==="manual"?"active":""} onClick={()=>setInputMode("manual")}>Adjust priorities</button></div>}
   {AI_SEARCH_ENABLED&&inputMode==="ai"?<textarea className="prompt" value={text} onChange={event=>setText(event.target.value)} aria-label="Describe your ideal area"/>:<div className="manual">
    <Field id="destination" label="Main destination"><input id="destination" value={destination} onChange={event=>setDestination(event.target.value)} placeholder="Town, postcode or address"/></Field>
    <Field id="transport" label="Travel mode"><select id="transport" value={transport} onChange={event=>setTransport(event.target.value as TransportMode)}><option value="any">Any travel mode</option><option value="drive">Drive</option><option value="transit">Public transport + walking</option><option value="cycle">Cycle</option><option value="walk">Walk</option></select></Field>
    {(transport==="transit"||transport==="any")&&<Field id="departure-time" label="Leave at (local time)"><input id="departure-time" type="datetime-local" value={departureTime} onChange={event=>setDepartureTime(event.target.value)}/><small>Leave blank for now. Sets the departure time for public transport journeys, including walks and transfers.</small></Field>}
    <div className="additional-destinations">{additional.map((item,index)=><fieldset key={index}><legend>Destination {index+2}</legend><label>Address or town<input aria-label={'Destination '+(index+2)} value={item.address} onChange={e=>setAdditional(old=>old.map((d,i)=>i===index?{...d,address:e.target.value}:d))}/></label><label>Travel mode<select aria-label={'Destination '+(index+2)+' travel mode'} value={item.transportMode} onChange={e=>setAdditional(old=>old.map((d,i)=>i===index?{...d,transportMode:e.target.value as TransportMode}:d))}>{[['any','Any travel mode'],['drive','Driving'],['transit','Public transport + walking'],['cycle','Cycling'],['walk','Walking']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Minimum minutes<input aria-label={'Destination '+(index+2)+' minimum minutes'} type="number" min="0" value={item.minimumMinutes} onChange={e=>setAdditional(old=>old.map((d,i)=>i===index?{...d,minimumMinutes:Number(e.target.value)}:d))}/></label><label>Maximum minutes<input aria-label={'Destination '+(index+2)+' maximum minutes'} type="number" min="1" max="180" value={item.maximumMinutes} onChange={e=>setAdditional(old=>old.map((d,i)=>i===index?{...d,maximumMinutes:Number(e.target.value)}:d))}/></label><button type="button" onClick={()=>setAdditional(old=>old.filter((_,i)=>i!==index))}>Remove destination {index+2}</button></fieldset>)}{additional.length<2&&<button type="button" className="btn light" onClick={()=>setAdditional(old=>[...old,{address:'',transportMode:'drive',minimumMinutes:0,maximumMinutes:45}])}>+ Add another destination</button>}<small>Up to three destinations, each with its own travel mode and time limits. Distance limits and departure time apply to all.</small></div>
    <Field id="minimum-budget" label="Minimum house price (£)"><input id="minimum-budget" type="number" min="0" step="10000" value={minimumBudget} onChange={event=>setMinimumBudget(Number(event.target.value))}/></Field>
    <Field id="budget" label="Maximum house price (£)"><input id="budget" type="number" min="1" step="10000" value={budget} onChange={event=>setBudget(Number(event.target.value))}/></Field>
    <RangeSlider id="distance" label="Distance" lower={minimumDistance} upper={distance} min={0} max={100} unit="km" onLowerChange={setMinimumDistance} onUpperChange={setDistance}/>
    <RangeSlider id="travel" label="Travel time" lower={minimumTravel} upper={maximumTravel} min={0} max={120} unit="min" onLowerChange={setMinimumTravel} onUpperChange={setMaximumTravel}/>
    <Slider id="journeys" label="Journeys per week" value={journeys} min={1} max={7} suffix="" set={setJourneys}/>
   </div>}
   <div className="prompt-foot"><small>Live road routes · HM Land Registry UK HPI, June 2026</small><button className="go" onClick={run} disabled={loading}>{loading?"Checking live data…":"Show my heat map"}<span>→</span></button></div>
   {error&&<p className="demo-note" role="alert">{error}</p>}
  </div>
  <p className="demo-note">Nearby areas follow your destination or selected map point. Historical prices are shown only where local data is available.</p>
 </section><section className="proof"><div><b>Live road routing</b>Google-calculated journey durations, cached for repeat searches.</div><div><b>Official price history</b>June 2026 UK HPI averages from HM Land Registry.</div><div><b>Transparent scoring</b>Combine commutes, recorded sale prices and school preferences.</div></section></main>;
}

function Results({destinations,budget,minimumBudget,edit,nav,onDestinationsChange}:{destinations:DestinationConstraint[];budget:number;minimumBudget:number;edit:()=>void;nav:React.ReactNode;onDestinationsChange:(destinations:DestinationConstraint[])=>void}){
 return <main className="workspace">{nav}
  <section className="result-head"><div><span className="eyebrow">Commute-time heatmap</span><h1 className="serif">Best areas for your life</h1></div><button className="btn light" onClick={edit}>Edit priorities</button></section>
  <AreaResults key={JSON.stringify(destinations)} onDestinationsChange={onDestinationsChange} destinations={destinations} budget={budget} minimumBudget={minimumBudget}/>
  <footer className="demo-note">Where shown, historical price averages use HM Land Registry data © Crown copyright and database right 2021, licensed under the Open Government Licence v3.0. Map © OpenStreetMap contributors.</footer>
 </main>
}
function Field({id,label,children}:{id:string;label:string;children:React.ReactNode}){return <div className="field"><label htmlFor={id}>{label}</label>{children}</div>}
function Slider({id,label,value,min,max,suffix,set}:{id:string;label:string;value:number;min:number;max:number;suffix:string;set:(value:number)=>void}){return <div className="range"><div className="range-head"><label htmlFor={id}>{label}</label><b>{value}{suffix}</b></div><input id={id} aria-label={label} type="range" min={min} max={max} value={value} onChange={event=>set(Number(event.target.value))}/></div>}
function Nav({criteria,onLoad}:{criteria?:SavedCriteria;onLoad:(criteria:SavedCriteria)=>void}){return <nav className="nav"><div className="brand"><span className="brandmark"/>placewise</div><AccountMenu criteria={criteria} onLoad={onLoad}/></nav>}
