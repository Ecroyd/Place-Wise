"use client";
import {useState} from "react";
import {SearchViewProvider,useSearchView} from './SearchView';
import {defaultView} from '@/src/lib/account/view';
import {AccountMenu} from './AccountMenu';
import type {SavedCriteria} from '@/src/lib/account/searches';
import {AreaResults} from "./AreaResults";
import {RangeSlider} from "./RangeSlider";
import type {DestinationConstraint,OptimisationMode,SearchCriteria,TransportMode} from "@/src/types/domain";
import {authHeaders} from '@/src/lib/supabase/browser';
import {useTypingPlaceholder} from './TypingPlaceholder';

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
 const [additional,setAdditional]=useState<{address:string;transportMode:TransportMode;minimumMinutes:number;maximumMinutes:number}[]>([]);
 const [destination,setDestination]=useState("");
 const [destinationFocused,setDestinationFocused]=useState(false);
 const placeholder=useTypingPlaceholder(!destination&&!destinationFocused);
 // Straight-line distance is off by default: journey time is what matters. It stays as an
 // optional extra filter for people who want one.
 const [limitDistance,setLimitDistance]=useState(false);
 const [distance,setDistance]=useState(40);
 const [minimumDistance,setMinimumDistance]=useState(0);
 const [minimumTravel,setMinimumTravel]=useState(0);
 const [maximumTravel,setMaximumTravel]=useState(60);
 const [journeys,setJourneys]=useState(5);
 const [departureTime,setDepartureTime]=useState("");
 const [transport,setTransport]=useState<TransportMode>("drive");

 function loadSaved(saved:SavedCriteria){
  const view=saved.view??defaultView();
  // Older saved searches stored a price range on the search itself; keep it as the layer's range.
  setView(saved.budget?{...view,price:{enabled:true,minimum:saved.minimumBudget??0,maximum:saved.budget}}:view);setSearchRevision(n=>n+1);
  const first=saved.destinations[0];
  setMode(saved.mode);
  setDestination(first.label);setTransport(first.transportMode);setMinimumTravel(first.minimumMinutes??0);setMaximumTravel(first.maximumMinutes??first.preferredMinutes??60);
  setLimitDistance(first.maximumDistanceKm!==undefined||(first.minimumDistanceKm??0)>0);setDistance(first.maximumDistanceKm??40);setMinimumDistance(first.minimumDistanceKm??0);setJourneys(first.journeysPerWeek);setDepartureTime(first.departureTime?new Date(new Date(first.departureTime).getTime()-new Date(first.departureTime).getTimezoneOffset()*60000).toISOString().slice(0,16):'');
  setAdditional(saved.destinations.slice(1).map(d=>({address:d.label,transportMode:d.transportMode,minimumMinutes:d.minimumMinutes??0,maximumMinutes:d.maximumMinutes??d.preferredMinutes??60})));
  setDestinations(saved.destinations);
 }
 const nav=<Nav criteria={destinations.length?{version:1,mode,destinations,view}:undefined} onLoad={loadSaved}/>;
 async function run(){
  setLoading(true);setError(undefined);
  try{
   if(additional.some(d=>!d.address.trim()||d.minimumMinutes<0||!Number.isFinite(d.minimumMinutes)||!Number.isFinite(d.maximumMinutes)||d.maximumMinutes<=0||d.minimumMinutes>d.maximumMinutes))throw new Error("Check each additional destination and its travel-time range.");
   if(!departureTime&&(transport==="transit"||transport==="mixed"||additional.some(d=>d.transportMode==="transit"||d.transportMode==="mixed")))throw new Error("Choose a departure time for public transport journeys. Timetables depend on when you leave.");
   if((!AI_SEARCH_ENABLED||inputMode==="manual")&&!destination.trim())throw new Error("Type where you need to get to: a town, postcode or address.");
   let parsed:SearchCriteria={mode,destinations:[],lifestyle:[]};
   if(AI_SEARCH_ENABLED&&inputMode==="ai"){
    const parse=await fetch("/api/criteria/parse",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
    const payload=await parse.json() as SearchCriteria&{error?:string};
    if(!parse.ok)throw new Error(payload.error??"Could not understand that search");
    parsed=payload;
   }
   parsed.mode=mode;
   if(!AI_SEARCH_ENABLED||inputMode==="manual"){
    const lookup=await fetch("/api/geocode",{method:"POST",headers:{"Content-Type":"application/json",...await authHeaders()},body:JSON.stringify({address:destination})});
    const place=await lookup.json() as {label?:string;latitude?:number;longitude?:number;error?:string};
    if(!lookup.ok||place.latitude===undefined||place.longitude===undefined)throw new Error(place.error??"Destination not found");
    parsed.destinations=[{id:`destination:${place.latitude.toFixed(5)},${place.longitude.toFixed(5)}`,label:place.label??destination,purpose:"Main destination",latitude:place.latitude,longitude:place.longitude,journeysPerWeek:journeys,minimumMinutes:minimumTravel,preferredMinutes:maximumTravel,maximumMinutes:maximumTravel,...(limitDistance?{minimumDistanceKm:minimumDistance,maximumDistanceKm:distance}:{}),transportMode:transport,weight:100,hardMaximum:true}];
    const extra = await Promise.all(additional.map(async(item,index)=>{
      const response=await fetch('/api/geocode',{method:'POST',headers:{'Content-Type':'application/json',...await authHeaders()},body:JSON.stringify({address:item.address})});const location=await response.json();if(!response.ok||typeof location.latitude!=='number'||typeof location.longitude!=='number')throw new Error(location.error??'Additional destination not found');
      return {...parsed.destinations[0],id:'additional:'+index+':'+location.latitude+','+location.longitude,label:location.label??item.address,latitude:location.latitude,longitude:location.longitude,transportMode:item.transportMode,minimumMinutes:item.minimumMinutes,maximumMinutes:item.maximumMinutes,preferredMinutes:item.maximumMinutes};
    }));parsed.destinations.push(...extra);
    parsed.lifestyle=[];
   }
   // Google (paid) routing is only used when a departure time is chosen.
   parsed.destinations=parsed.destinations.map(item=>departureTime?{...item,departureTime:new Date(departureTime).toISOString()}:{...item,departureTime:undefined});
   setView(defaultView());setSearchRevision(n=>n+1);setDestinations(parsed.destinations);
  }catch(cause){setError(cause instanceof Error?cause.message:"Optimisation failed")}
  finally{setLoading(false)}
 }

 if(destinations.length)return <Results key={searchRevision} destinations={destinations} edit={()=>setDestinations([])} nav={nav} onDestinationsChange={setDestinations}/>;
 return <main className="shell home">{nav}
 <section className="home-hero">
  <div className="home-intro">
   <span className="eyebrow">Find your next area</span>
   <h1 className="serif">Where does your life <em>fit best?</em></h1>
   <p className="sub">Tell Commutemap where you need to get to. It maps your commute, shows the areas that work, and lets you layer on the facts you&apos;d want before you move.</p>
   <ul className="home-points">
    <li><b>Commutes that work</b><span>A journey-time heatmap to up to three places, by car, public transport, bike or on foot.</span></li>
    <li><b>Life around you</b><span>Switch on school catchments, sold house prices, flood risk, crime, parks, shops and transport stops over the same map.</span></li>
    <li><b>A quick read on each area</b><span>A short write-up of every nearby town, with its journey times and typical prices.</span></li>
   </ul>
  </div>
  <div className="search-card">
   <div className="card-head"><h2>Start your search</h2><div className="mode-switch compact"><button className={mode==="live"?"active":""} onClick={()=>setMode("live")}>Where should I live?</button><button className={mode==="work"?"active":""} onClick={()=>setMode("work")}>Where should I work?</button></div></div>
   {AI_SEARCH_ENABLED&&<div className="input-tabs"><button className={inputMode==="ai"?"active":""} onClick={()=>setInputMode("ai")}>✦ Describe your ideal area</button><button className={inputMode==="manual"?"active":""} onClick={()=>setInputMode("manual")}>Adjust priorities</button></div>}
   {AI_SEARCH_ENABLED&&inputMode==="ai"?<textarea className="prompt" value={text} onChange={event=>setText(event.target.value)} aria-label="Describe your ideal area"/>:<div className="manual">
    <Field id="destination" label="Main destination"><input id="destination" value={destination} onChange={event=>setDestination(event.target.value)} onFocus={()=>setDestinationFocused(true)} onBlur={()=>setDestinationFocused(false)} placeholder={placeholder} aria-describedby="destination-hint" autoComplete="off"/><small id="destination-hint" className="sr-only">Type a town, postcode or address you travel to, such as Hammersmith or Edinburgh.</small></Field>
    <Field id="transport" label="Travel mode"><select id="transport" value={transport} onChange={event=>setTransport(event.target.value as TransportMode)}><option value="any">Any travel mode</option><option value="drive">Drive</option><option value="transit">Public transport + walking</option><option value="cycle">Cycle</option><option value="walk">Walk</option></select></Field>
    <div className="additional-destinations">{additional.map((item,index)=><fieldset key={index}><legend>Destination {index+2}</legend><label>Address or town<input aria-label={'Destination '+(index+2)} value={item.address} onChange={e=>setAdditional(old=>old.map((d,i)=>i===index?{...d,address:e.target.value}:d))}/></label><label>Travel mode<select aria-label={'Destination '+(index+2)+' travel mode'} value={item.transportMode} onChange={e=>setAdditional(old=>old.map((d,i)=>i===index?{...d,transportMode:e.target.value as TransportMode}:d))}>{[['any','Any travel mode'],['drive','Driving'],['transit','Public transport + walking'],['cycle','Cycling'],['walk','Walking']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label>Minimum minutes<input aria-label={'Destination '+(index+2)+' minimum minutes'} type="number" min="0" value={item.minimumMinutes} onChange={e=>setAdditional(old=>old.map((d,i)=>i===index?{...d,minimumMinutes:Number(e.target.value)}:d))}/></label><label>Maximum minutes<input aria-label={'Destination '+(index+2)+' maximum minutes'} type="number" min="1" max="180" value={item.maximumMinutes} onChange={e=>setAdditional(old=>old.map((d,i)=>i===index?{...d,maximumMinutes:Number(e.target.value)}:d))}/></label><button type="button" onClick={()=>setAdditional(old=>old.filter((_,i)=>i!==index))}>Remove destination {index+2}</button></fieldset>)}{additional.length<2&&<button type="button" className="btn light" onClick={()=>setAdditional(old=>[...old,{address:'',transportMode:'drive',minimumMinutes:0,maximumMinutes:45}])}>+ Add another destination</button>}<small>Up to three destinations, each with its own travel mode and time limits. Distance limits and departure time apply to all.</small></div>
    <Field id="departure-time" label={transport==="transit"?"When are you travelling? (needed for public transport)":"When are you travelling? (optional)"}><input id="departure-time" type="datetime-local" value={departureTime} onChange={event=>setDepartureTime(event.target.value)}/><small>{departureTime?"Journey times will use live traffic and public transport timetables for this day and time.":"Leave blank to see typical journey times by car, bike or on foot. Add a day and time to include public transport and live traffic."}</small></Field>
    <details className="refine"><summary>Refine journey time</summary><div className="refine-body">
    <RangeSlider id="travel" label="Travel time" lower={minimumTravel} upper={maximumTravel} min={0} max={120} unit="min" onLowerChange={setMinimumTravel} onUpperChange={setMaximumTravel}/>
    <label className="distance-toggle"><input type="checkbox" checked={limitDistance} onChange={event=>setLimitDistance(event.target.checked)}/> Also limit straight-line distance <small>(optional; journey time already decides what fits)</small></label>
    {limitDistance&&<RangeSlider id="distance" label="Distance" lower={minimumDistance} upper={distance} min={0} max={100} unit="km" onLowerChange={setMinimumDistance} onUpperChange={setDistance}/>}
    <Slider id="journeys" label="Journeys per week" value={journeys} min={1} max={7} suffix="" set={setJourneys}/>
    </div></details>
   </div>}
   <button className="go wide" onClick={run} disabled={loading}>{loading?"Checking live data…":"Show my heat map"}<span>→</span></button>
   {error&&<p className="form-error" role="alert">{error}</p>}
  </div>
 </section>
 <section className="home-steps" aria-label="How it works">
  <h2 className="serif">How it works</h2>
  <ol>
   <li><b>Add where you travel</b><span>Work, school, family: up to three places, each with its own travel mode and time limit.</span></li>
   <li><b>See your commute heatmap</b><span>Every area is coloured by journey time, so you can see at a glance where every trip fits.</span></li>
   <li><b>Layer on what matters</b><span>Switch on schools, sold prices, flood risk, crime and amenities, read up on each area, and save searches to your account.</span></li>
  </ol>
 </section>
 <section className="home-layers" aria-labelledby="layers-heading">
  <div className="home-layers-intro">
   <h2 id="layers-heading" className="serif">Layer on what matters</h2>
   <p>Turn map overlays on and off over your commute heatmap to see what an area is really like, street by street.</p>
  </div>
  <ul>
   <li><b>School catchments</b><span>Published catchment boundaries, so you can see which schools a street falls in. Click a school to highlight its area.</span></li>
   <li><b>Schools &amp; inspections</b><span>State and independent schools across England, Wales and Scotland, with their latest inspection results.</span></li>
   <li><b>Sold house prices</b><span>Recent HM Land Registry sales nearby, in a price range you set on the map.</span></li>
   <li><b>Flood risk</b><span>Environment Agency river, sea and surface-water flood maps.</span></li>
   <li><b>Reported crime</b><span>The latest police.uk street-level reports around the area.</span></li>
   <li><b>Parks, amenities &amp; transport</b><span>Green space, shops and everyday services, and bus, tram and rail stops.</span></li>
  </ul>
  <p className="home-layers-note">Catchment boundaries cover the 26 councils that publish them as open data, including Glasgow, Edinburgh, Sheffield, Hampshire, Wiltshire, Cheshire, Bristol and Stockport. Flood maps cover England.</p>
 </section>
 <p className="home-sources">Built on official and open data: Google routing, HM Land Registry, Ofsted and DfE (plus Welsh and Scottish Government school data), the Environment Agency, police.uk and OpenStreetMap.</p>
</main>;
}

function Results({destinations,edit,nav,onDestinationsChange}:{destinations:DestinationConstraint[];edit:()=>void;nav:React.ReactNode;onDestinationsChange:(destinations:DestinationConstraint[])=>void}){
 return <main className="workspace">{nav}
  <section className="result-head"><div><span className="eyebrow">Commute-time heatmap</span><h1 className="serif">Best areas for your life</h1></div><button className="btn light" onClick={edit}>Edit priorities</button></section>
  <AreaResults key={JSON.stringify(destinations)} onDestinationsChange={onDestinationsChange} destinations={destinations}/>
  <footer className="demo-note">Where shown, historical price averages use HM Land Registry data © Crown copyright and database right 2021, licensed under the Open Government Licence v3.0. Map © OpenStreetMap contributors.</footer>
 </main>
}
function Field({id,label,children}:{id:string;label:string;children:React.ReactNode}){return <div className="field"><label htmlFor={id}>{label}</label>{children}</div>}
function Slider({id,label,value,min,max,suffix,set}:{id:string;label:string;value:number;min:number;max:number;suffix:string;set:(value:number)=>void}){return <div className="range"><div className="range-head"><label htmlFor={id}>{label}</label><b>{value}{suffix}</b></div><input id={id} aria-label={label} type="range" min={min} max={max} value={value} onChange={event=>set(Number(event.target.value))}/></div>}
function Nav({criteria,onLoad}:{criteria?:SavedCriteria;onLoad:(criteria:SavedCriteria)=>void}){return <nav className="nav"><div className="brand"><span className="brandmark"/>commutemap</div><AccountMenu criteria={criteria} onLoad={onLoad}/></nav>}
