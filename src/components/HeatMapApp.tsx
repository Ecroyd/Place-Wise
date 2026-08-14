"use client";
/* eslint-disable jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions */

import { useMemo, useState } from "react";
import { DeterministicCriteriaParser } from "@/src/lib/ai/parser";
import { mockCells } from "@/src/lib/data/mockCells";
import { optimise } from "@/src/lib/optimisation/engine";
import { CachedRoutingProvider, MemoryTravelTimeCache } from "@/src/lib/routing/cache";
import { MockRoutingProvider } from "@/src/lib/routing/provider";
import type { LocationScore, OptimisationMode } from "@/src/types/domain";

const demoPrompt = "I work in Middleton five days a week. My partner works from home. We'd like somewhere fairly rural with good schools, green space and decent restaurants nearby, with no more than about 35 minutes to work.";
const positions = [[65,22],[37,17],[19,37],[49,43],[71,54],[29,62],[57,72],[13,68],[79,35],[42,78],[62,10],[25,82]];
const colour = (score:number) => score >= 88 ? "#7fbd62" : score >= 84 ? "#b9d86f" : score >= 80 ? "#e2cd74" : "#d99564";

export function HeatMapApp() {
  const [mode,setMode] = useState<OptimisationMode>("live");
  const [inputMode,setInputMode] = useState<"ai"|"manual">("ai");
  const [text,setText] = useState(demoPrompt);
  const [results,setResults] = useState<LocationScore[]>([]);
  const [focused,setFocused] = useState<string>();
  const [selected,setSelected] = useState<string[]>([]);
  const [loading,setLoading] = useState(false);
  const [schools,setSchools] = useState(90);
  const [greenSpace,setGreenSpace] = useState(90);
  const chosen = useMemo(() => results.filter(r => selected.includes(r.h3Index)), [results,selected]);

  async function run() {
    setLoading(true);
    try {
      const criteria = await new DeterministicCriteriaParser().parse(inputMode === "ai" ? text : "Middleton five days, 35 minutes, schools and green space");
      criteria.mode = mode;
      criteria.property = undefined;
      if (inputMode === "manual") criteria.lifestyle = criteria.lifestyle.map(p => p.key === "schools" ? {...p,weight:schools} : p.key === "greenSpace" ? {...p,weight:greenSpace} : p);
      setResults(await optimise(criteria,mockCells,new CachedRoutingProvider(new MockRoutingProvider(),new MemoryTravelTimeCache())));
    } finally { setLoading(false); }
  }

  function toggle(id:string) { setSelected(items => items.includes(id) ? items.filter(x => x !== id) : items.length < 4 ? [...items,id] : items); }
  if (results.length) return <Results mode={mode} results={results} focused={focused} setFocused={setFocused} selected={selected} toggle={toggle} chosen={chosen} edit={()=>setResults([])}/>;

  return <main className="shell"><Nav/><section className="hero"><span className="eyebrow">Area recommendations, made personal</span><h1 className="serif">Where does your life<br/><em>fit best?</em></h1><p className="sub">Tell us what matters — commutes, schools, green space and everything in between. We’ll turn your priorities into a heat map of the best areas.</p><div className="mode-switch"><button className={mode === "live" ? "active" : ""} onClick={()=>setMode("live")}>Where should I live?</button><button className={mode === "work" ? "active" : ""} onClick={()=>setMode("work")}>Where should I work?</button></div><div className="search-card"><div className="input-tabs"><button className={inputMode === "ai" ? "active" : ""} onClick={()=>setInputMode("ai")}>✦ Describe your ideal area</button><button className={inputMode === "manual" ? "active" : ""} onClick={()=>setInputMode("manual")}>Adjust priorities</button></div>{inputMode === "ai" ? <textarea className="prompt" value={text} onChange={e=>setText(e.target.value)} aria-label="Describe your ideal area"/> : <div className="manual"><div className="field"><label htmlFor="destination">Main destination</label><input id="destination" defaultValue="Middleton"/></div><div className="field"><label htmlFor="commute">Preferred commute</label><select id="commute" defaultValue="35"><option value="35">35 minutes</option><option value="45">45 minutes</option></select></div><Weight label="Schools" value={schools} setValue={setSchools}/><Weight label="Green space" value={greenSpace} setValue={setGreenSpace}/></div>}<div className="prompt-foot"><small>No property listings or house-price data required</small><button className="go" onClick={run} disabled={loading}>{loading ? "Building your heat map…" : "Show my heat map"}<span>→</span></button></div></div><p className="demo-note">Demo area scores and travel times are explicitly mock data — not geographic advice.</p></section><section className="proof"><div><b>Area-level insight</b>See geographic fit without needing property listings.</div><div><b>A real heat map</b>Every cell represents the combined strength of your priorities.</div><div><b>Explainable results</b>Understand why each area is hot, good or a compromise.</div></section></main>;
}

function Results({mode,results,focused,setFocused,selected,toggle,chosen,edit}:{mode:OptimisationMode;results:LocationScore[];focused?:string;setFocused:(id:string)=>void;selected:string[];toggle:(id:string)=>void;chosen:LocationScore[];edit:()=>void}) {
  const active = results.find(r=>r.h3Index===focused) ?? results[0];
  return <main className="workspace"><Nav/><section className="result-head"><div><span className="eyebrow">Your suitability heat map</span><h1 className="serif">Best areas for your life</h1></div><p>Area fit based on {mode === "live" ? "living" : "working"} priorities <button className="btn light" onClick={edit}>Edit priorities</button></p></section><div className="heat-layout"><section className="heat-map" aria-label="Suitability heat map of Greater Manchester"><div className="heat-road one"/><div className="heat-road two"/><div className="heat-legend"><b>AREA FIT</b><span><i style={{background:"#7fbd62"}}/>Excellent</span><span><i style={{background:"#b9d86f"}}/>Good</span><span><i style={{background:"#e2cd74"}}/>Compromise</span></div>{results.map((r,i)=><button key={r.h3Index} aria-label={`View ${r.town}, suitability ${r.overallScore}`} className={`heat-cell ${active.h3Index === r.h3Index ? "active" : ""}`} style={{left:`${positions[i][0]}%`,top:`${positions[i][1]}%`,background:colour(r.overallScore)}} onClick={()=>setFocused(r.h3Index)}><strong>{r.overallScore}</strong><small>{r.town}</small></button>)}<div className="heat-callout"><span className="eyebrow">Selected area</span><h2>{active.town}</h2><b>{active.overallScore}/100 · {active.overallScore >= 88 ? "Excellent fit" : "Good fit"}</b><p>{active.positives.slice(0,2).join(" · ")}</p></div></section><aside className="area-list"><div className="area-intro"><b>Ranked areas</b><span>These explain the heat map — they are not property listings.</span></div>{results.slice(0,8).map((r,i)=><article className={`area-card ${active.h3Index === r.h3Index ? "selected" : ""}`} key={r.h3Index} onClick={()=>setFocused(r.h3Index)}><div className="area-rank">{i+1}</div><div className="area-copy"><h2>{r.town}</h2><div className="area-metrics"><span>Commute <b>{r.destinationResults[0]?.minutes} min</b></span><span>Schools <b>{r.components.schools}</b></span><span>Lifestyle <b>{r.components.lifestyle}</b></span></div><p>{r.positives[0] ?? r.compromises[0]}</p></div><div className="area-score" style={{background:colour(r.overallScore)}}>{r.overallScore}</div><label className="check" onClick={e=>e.stopPropagation()}><input type="checkbox" checked={selected.includes(r.h3Index)} onChange={()=>toggle(r.h3Index)}/> Compare</label></article>)}</aside></div>{chosen.length>0&&<div className="compare-bar"><span>{chosen.length} area{chosen.length>1?"s":""} selected</span><button onClick={()=>setSelectedMessage(chosen)}>Compare on map</button></div>}</main>;
}

function setSelectedMessage(rows:LocationScore[]) { alert(rows.map(r=>`${r.town}: ${r.overallScore}/100`).join("\n")); }
function Weight({label,value,setValue}:{label:string;value:number;setValue:(n:number)=>void}) { return <div className="range"><div className="range-head"><span>{label}</span><b>{value > 80 ? "High" : value > 50 ? "Medium" : "Low"}</b></div><input aria-label={`${label} importance`} type="range" value={value} onChange={e=>setValue(Number(e.target.value))}/></div>; }
function Nav() { return <nav className="nav"><div className="brand"><span className="brandmark"/>placewise</div><div className="nav-actions"><button className="btn">How it works</button><button className="btn">My areas</button><button className="btn primary">Sign in</button></div></nav>; }
