"use client";
import { useCallback, useEffect, useState } from "react";
import { CombinedMatches } from "./CombinedMatches";
import type { CombinedMatch } from "@/src/lib/data/combined";
import { GoogleAreaMap } from "./GoogleAreaMap";
import type { Coordinates, DestinationConstraint, TransportMode } from "@/src/types/domain";
import type { NearbyArea } from "@/src/lib/data/nearby";

const money = (n:number) => new Intl.NumberFormat("en-GB",{style:"currency",currency:"GBP",maximumFractionDigits:0}).format(n);
export function AreaResults({ destinations, budget, minimumBudget }: { destinations: DestinationConstraint[]; budget: number; minimumBudget:number }) {
  const [effectiveDestinations,setEffectiveDestinations] = useState(destinations);
  const [combinedMatches,setCombinedMatches] = useState<CombinedMatch[]>([]);
  const changeMode = (mode:TransportMode,index:number) => { setEffectiveDestinations(old=>old.map((d,i)=>i===index?{...d,transportMode:mode,departureTime:(mode==='any'||mode==='transit'||mode==='mixed')?(d.departureTime??new Date().toISOString()):undefined}:d)); setFocused(undefined); };
  const [center,setCenter] = useState<Coordinates>();
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
        const response = await fetch("/api/areas",{method:"POST",signal:controller.signal,headers:{"Content-Type":"application/json"},body:JSON.stringify({destination,destinations:effectiveDestinations,center,budget})});
        const payload = await response.json() as {areas?:NearbyArea[];centerLabel?:string;error?:string};
        if(!response.ok || !payload.areas) throw new Error(payload.error ?? "Nearby areas unavailable");
        if(controller.signal.aborted)return;
        setAreas(payload.areas); setCenterLabel(payload.centerLabel ?? "the selected point");
      } catch(cause) { if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:"Nearby areas unavailable"); }
      finally { if(!controller.signal.aborted)setLoading(false); }
    },200);
    return () => { clearTimeout(timer); controller.abort(); };
  },[destination,effectiveDestinations,center,budget,retry]);
  return <div className="heat-layout">
    <section className="heat-map google"><GoogleAreaMap destinations={effectiveDestinations} budget={budget} minimumBudget={minimumBudget} onModeChange={changeMode} combinedMatches={combinedMatches} selectedArea={focused} onPointSelected={selectPoint}/></section>
    <aside className="area-list" aria-label="Nearby areas"><CombinedMatches destinations={effectiveDestinations} center={center} minimumPrice={minimumBudget} maximumPrice={budget} onMatches={setCombinedMatches} onSelect={match=>setFocused({...match,address:match.name,minutes:match.journeys[0]?.minutes??null,withinLimits:true,reasons:[]})}/>
      <div className="area-intro"><b>Areas near {centerLabel}</b><span>Travel fit, then journey time.</span></div>
      <p className="demo-note">Click the map to explore nearby areas, or choose an area to locate it. House prices: {money(minimumBudget)}–{money(budget)}. Sold-price pins are filtered to this range; area averages below are comparisons.</p>
      {center&&<button className="btn light" onClick={()=>{setCenter(undefined);setFocused(undefined)}}>Back to destination areas</button>}
      {loading&&<p className="demo-note" role="status">Finding nearby towns and checking journeys…</p>}
      {error&&<p className="demo-note" role="alert">{error} <button onClick={()=>setRetry(value=>value+1)}>Retry</button></p>}
      {!loading&&!error&&!areas.length&&<p className="demo-note">No named areas found here. Try another map point or a wider distance range.</p>}
      {areas.map(area=><button className={`area-card area-button ${focused?.id===area.id?"selected":""}`} key={area.id} onClick={()=>setFocused(area)}>
        <span className="area-rank">{area.withinLimits?"✓":"–"}</span>
        <span className="area-copy"><strong>{area.name}</strong><small>{area.address}</small>
          <span className="area-metrics"><span>Journey<b>{area.minutes===null?"Unavailable":`${area.minutes} min`}</b></span><span>Distance<b>{area.distanceKm===undefined?"Unavailable":`${area.distanceKm} km`}</b></span></span>
          {area.destinationJourneys?.map((journey,index)=><small key={index}>{journey.label}: {journey.minutes===null?"Unavailable":journey.minutes+" min"} · {journey.mode}</small>)}<small>{area.withinLimits?"Within every destination’s travel and distance limits":area.reasons.join(" · ")}</small>
          <small>{area.typicalHousePrice===undefined?"Local price data unavailable":`${money(area.typicalHousePrice)} · ${area.priceLabel}${area.withinBudget===undefined?"":area.typicalHousePrice>=minimumBudget&&area.typicalHousePrice<=budget?" · within price range":" · outside price range"}`}</small>
        </span>
      </button>)}
    </aside>
  </div>;
}
