"use client";
import { useCallback, useEffect, useState } from "react";
import {useViewField} from './SearchView';
import { CombinedMatches } from "./CombinedMatches";
import type { CombinedMatch } from "@/src/lib/data/combined";
import { GoogleAreaMap } from "./GoogleAreaMap";
import { LayerBar } from "./MapLayers";
import type { Coordinates, DestinationConstraint, TransportMode } from "@/src/types/domain";
import type { NearbyArea } from "@/src/lib/data/nearby";
import {authHeaders} from '@/src/lib/supabase/browser';

const money = (n:number) => new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0}).format(n);
export function AreaResults({ destinations,onDestinationsChange }: {onDestinationsChange?:(destinations:DestinationConstraint[])=>void; destinations: DestinationConstraint[] }) {
  const [effectiveDestinations,setEffectiveDestinations] = useState(destinations);
  const [combinedMatches,setCombinedMatches] = useState<CombinedMatch[]>([]);
  const changeDeparture = (departureTime:string|undefined,index:number) => { const next=effectiveDestinations.map((d,i)=>i===index?{...d,departureTime}:d);setEffectiveDestinations(next);onDestinationsChange?.(next); };
  const changeMode = (mode:TransportMode,index:number) => { const next=effectiveDestinations.map((d,i)=>i===index?{...d,transportMode:mode,departureTime:d.departureTime}:d);setEffectiveDestinations(next);onDestinationsChange?.(next); setFocused(undefined); };
  const [center,setCenter] = useViewField('searchPoint');
  const [areas,setAreas] = useState<NearbyArea[]>([]);
  const [centerLabel,setCenterLabel] = useState(destinations[0]?.label ?? "your destination");
  const [focused,setFocused] = useState<NearbyArea>();
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState<string>();
  const [retry,setRetry] = useState(0);
  const destination = effectiveDestinations[0];
  const selectPoint = useCallback((point: Coordinates) => { setCenter(point); setFocused(undefined); },[setCenter,setFocused]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true); setError(undefined); setAreas([]);
      try {
        const response = await fetch("/api/areas",{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json",...await authHeaders()},body:JSON.stringify({destination,destinations:effectiveDestinations,center})});
        const payload = await response.json() as {areas?:NearbyArea[];centerLabel?:string;error?:string};
        if(!response.ok || !payload.areas) throw new Error(payload.error ?? "Nearby areas unavailable");
        if(controller.signal.aborted)return;
        setAreas(payload.areas); setCenterLabel(payload.centerLabel ?? "the selected point");
      } catch(cause) { if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Nearby areas unavailable"); }
      finally { if(!controller.signal.aborted)setLoading(false); }
    },200);
    return () => { clearTimeout(timer); controller.abort(); };
  },[destination,effectiveDestinations,center,retry]);
  return <><LayerBar/><div className="heat-layout">
    <section className="heat-map google"><GoogleAreaMap destinations={effectiveDestinations} onModeChange={changeMode} onDepartureChange={changeDeparture} combinedMatches={combinedMatches} selectedArea={focused} onPointSelected={selectPoint}/></section>
    <aside className="area-list" aria-label="Nearby areas"><CombinedMatches destinations={effectiveDestinations} center={center} onMatches={setCombinedMatches} onSelect={match=>setFocused({...match,address:match.name,minutes:match.journeys[0]?.minutes??null,withinLimits:true,reasons:[]})}/>
      <div className="area-intro"><b>Areas near {centerLabel.replace(/^Pin near /,"")}</b><span>Up to 8 sampled towns, ordered by travel fit.</span></div>
      <p className="demo-note">Click the map to explore nearby areas, or choose an area to locate it.</p>
      {center&&<button className="btn light" onClick={()=>{setCenter(undefined);setFocused(undefined)}}>Back to destination areas</button>}
      {loading&&<p className="demo-note" role="status">Finding nearby towns and checking journeys…</p>}
      {error&&<p className="demo-note" role="alert">{error} <button onClick={()=>setRetry(value=>value+1)}>Retry</button></p>}
      {!loading&&!error&&!areas.length&&<p className="demo-note">No named areas found here. Try another map point or a wider distance range.</p>}
      {areas.map(area=><div className={`area-card area-entry ${focused?.id===area.id?"selected":""}`} key={area.id}>
        <button type="button" className="area-main" onClick={()=>setFocused(area)} aria-label={`Show ${area.name} on the map`}>
        <span className="area-rank">{area.withinLimits?"✓":"–"}</span>
        <span className="area-copy"><strong>{area.name}</strong><small>{area.address}</small>
          <span className="area-metrics"><span>Journey<b>{area.minutes===null?"Unavailable":`${area.minutes} min`}</b></span><span>Distance<b>{area.distanceKm===undefined?"Unavailable":`${area.distanceKm} km`}</b></span></span>
          {area.destinationJourneys?.map((journey,index)=><small key={index}>{journey.label}: {journey.minutes===null?"Unavailable":journey.minutes+" min"} · {journey.mode}</small>)}<small>{area.withinLimits?"Within every destination’s travel and distance limits":area.reasons.join(" · ")}</small>
          <small>{area.typicalHousePrice===undefined?"Local price data unavailable":`${money(area.typicalHousePrice)} · ${area.priceLabel}`}</small>
        </span>
        </button>
        <AreaWriteUp area={area} destination={(destination?.label??'your destination').split(',')[0]}/>
      </div>)}
    </aside>
  </div></>;
}

type Summary={text:string;title:string;url:string;source:string};
const summaries=new Map<string,Summary|null>();
// What the area is like (from Wikipedia when an article sits within a few km of it), then what it means for this search.
function AreaWriteUp({area,destination}:{area:NearbyArea;destination:string}){
  const key=`${area.name}:${area.latitude.toFixed(2)},${area.longitude.toFixed(2)}`;
  const [summary,setSummary]=useState<Summary|null|undefined>(summaries.get(key));
  useEffect(()=>{
    if(summaries.has(key))return;
    const controller=new AbortController();
    const context=area.address.split(',').map(part=>part.trim()).filter(part=>part&&part.toLowerCase()!==area.name.toLowerCase()&&!/^(england|wales|scotland|united kingdom|uk)$/i.test(part)).join(' ');
    void fetch(`/api/area-summary?${new URLSearchParams({name:area.name,context,lat:String(area.latitude),lng:String(area.longitude)})}`,{signal:controller.signal})
      .then(response=>response.json() as Promise<{summary?:Summary|null}>)
      .then(payload=>{summaries.set(key,payload.summary??null);setSummary(payload.summary??null);})
      .catch(()=>{if(!controller.signal.aborted)setSummary(null);});
    return()=>controller.abort();
  },[key,area.name,area.address,area.latitude,area.longitude]);
  const journey=area.minutes===null?undefined:`${area.minutes} minutes from ${destination}${area.distanceKm===undefined?'':`, about ${area.distanceKm} km away`}`;
  const price=area.typicalHousePrice===undefined?'':` Recorded sales have averaged around ${money(area.typicalHousePrice)}.`;
  return <div className="area-summary">
    {summary===undefined?<p className="area-summary-loading">Reading up on {area.name}…</p>:summary?<p>{summary.text} <a href={summary.url} target="_blank" rel="noopener noreferrer">Wikipedia</a></p>:null}
    {journey&&<p className="area-summary-fit">{area.withinLimits?`A good fit: ${journey}, inside your limits.`:`${journey[0].toUpperCase()+journey.slice(1)}, outside at least one of your limits.`}{price}</p>}
  </div>;
}
