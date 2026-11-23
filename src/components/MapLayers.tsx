"use client";
import {useViewField,useSearchView} from './SearchView';
import {useEffect,useState,useCallback} from 'react';
import type {Map as MapLibreMap,Marker,Popup} from 'maplibre-gl';
import {layerDefinitions,type LayerId,type LayerData,type PointLayer,type ViewBounds} from '@/src/lib/data/layers';

import {CatchmentOverlay} from './CatchmentOverlay';
import {CATCHMENT_COUNCILS} from '@/src/lib/data/catchments';

function PointOverlay({map,id,phase,rating,reportArea,sector,country,onCatchment}:{country:string;sector:string;onCatchment:(urn:string)=>void;map:MapLibreMap;id:PointLayer;phase:string;rating:string;reportArea:string}){
  const [price]=useViewField('price');const minimumBudget=price.minimum,budget=price.maximum;
  const [bounds,setBounds]=useState<ViewBounds>();const [data,setData]=useState<LayerData>();const [error,setError]=useState<string>();const [loading,setLoading]=useState(true);const [retry,setRetry]=useState(0);
  useEffect(()=>{let timer:ReturnType<typeof setTimeout>;const update=()=>{clearTimeout(timer);timer=setTimeout(()=>{const b=map.getBounds();setLoading(true);setError(undefined);setData(undefined);setBounds({west:+b.getWest().toFixed(4),east:+b.getEast().toFixed(4),south:+b.getSouth().toFixed(4),north:+b.getNorth().toFixed(4)});},400);};update();map.on('moveend',update);return()=>{clearTimeout(timer);map.off('moveend',update);};},[map]);
  useEffect(()=>{if(!bounds)return;const controller=new AbortController();const params=new URLSearchParams({layer:id,...(id==='property'?{minimumPrice:String(minimumBudget),maximumPrice:String(budget)}:{}),...(id==='schools'?{phase,rating,reportArea,sector,country}:{}),...Object.fromEntries(Object.entries(bounds).map(([k,v])=>[k,String(v)]))});void fetch(`/api/layers?${params}`,{signal:controller.signal}).then(async response=>{const payload=await response.json();if(!response.ok)throw Error(payload.error??'Layer unavailable');if(!controller.signal.aborted)setData(payload);}).catch(cause=>{if(!controller.signal.aborted)setError(cause.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});return()=>controller.abort();},[bounds,id,retry,budget,minimumBudget,phase,rating,reportArea,sector,country]);
  useEffect(()=>{if(!data)return;let cancelled=false;const markers:Marker[]=[];const popups:Popup[]=[];
    void import('maplibre-gl').then(({Marker,Popup})=>{if(cancelled)return;const definition=layerDefinitions.find(d=>d.id===id)!;
      for(const point of data.points){
        const pin=document.createElement('button');pin.className='layer-pin';pin.type='button';pin.style.background=definition.colour;pin.textContent=point.sector==='independent'?'I':definition.symbol;if(point.sector==='independent')pin.style.background='#176f85';pin.setAttribute('aria-label',`${definition.label}: ${point.name}`);pin.title=point.name;
        const content=document.createElement('div');content.className='layer-popup';const heading=document.createElement('strong');heading.textContent=point.name;content.append(heading);
        for(const text of point.details){const line=document.createElement('p');line.textContent=text;content.append(line);}
        if(point.url&&/^https:\/\//.test(point.url)){const link=document.createElement('a');link.href=point.url;link.target='_blank';link.rel='noopener noreferrer';link.textContent=point.urlLabel??(id==='schools'?'View Ofsted report':'View source');content.append(link);}
        const popup=new Popup({offset:16,maxWidth:'330px'}).setDOMContent(content);popups.push(popup);
        const marker=new Marker({element:pin}).setLngLat([point.longitude,point.latitude]).setPopup(popup).addTo(map);markers.push(marker);
        pin.addEventListener('click',event=>{event.stopPropagation();popups.forEach(other=>{if(other!==popup)other.remove();});popup.setLngLat([point.longitude,point.latitude]).addTo(map);if(id==='schools')onCatchment(point.id);});
      }
    });return()=>{cancelled=true;markers.forEach(m=>m.remove());popups.forEach(p=>p.remove());};
  },[data,map,id,phase,onCatchment]);
  return <div className="layer-status" aria-live="polite">{loading?'Loading this view…':error?<><span>{error}</span> <button onClick={()=>{if(error.includes('Zoom'))map.easeTo({zoom:Math.max(map.getZoom()+1,13)});else {setLoading(true);setError(undefined);setData(undefined);setRetry(n=>n+1);}}}>{error.includes('Zoom')?'Zoom in':'Retry'}</button></>:data?<><span>{data.points.length} pins. {data.note}</span><a href={data.sourceUrl} target="_blank" rel="noreferrer">{data.source}</a></>:null}</div>;
}
function FloodOverlay({map,kind}:{map:MapLibreMap;kind:'river'|'surface'}){
  const [zoom,setZoom]=useState(map.getZoom());const [error,setError]=useState(false);const [retry,setRetry]=useState(0);
  useEffect(()=>{const id=`flood-${kind}`;const update=()=>setZoom(map.getZoom());const fail=(event:unknown)=>{if((event as {sourceId?:string}).sourceId===id)setError(true);};
    map.addSource(id,{type:'raster',tiles:[`${window.location.origin}/api/flood/${kind}?bbox={bbox-epsg-3857}`],tileSize:256,minzoom:14,attribution:'© Environment Agency copyright and database right 2025 · OGL'});map.addLayer({id,type:'raster',source:id,paint:{'raster-opacity':0.65}});map.on('zoomend',update);map.on('error',fail);return()=>{map.off('zoomend',update);map.off('error',fail);if(map.getLayer(id))map.removeLayer(id);if(map.getSource(id))map.removeSource(id);};
  },[map,kind,retry]);
  const service=kind==='river'?'nafra2-risk-of-flooding-from-rivers-and-sea':'nafra2-risk-of-flooding-from-surface-water';const layer=kind==='river'?'rofrs_4band':'rofsw';
  return <div className="layer-status">England · annual flood likelihood; area-level guidance. {zoom<14&&<button onClick={()=>map.easeTo({zoom:14})}>Zoom in to see flood detail</button>}{error&&<span role="alert">Flood tiles unavailable. <button onClick={()=>{setError(false);setRetry(n=>n+1);}}>Retry</button></span>}<a href={`https://environment.data.gov.uk/spatialdata/${service}/wms?SERVICE=WMS&REQUEST=GetLegendGraphic&VERSION=1.1.1&FORMAT=image/png&LAYER=${layer}`} target="_blank" rel="noreferrer">View official colour legend</a><a href="https://www.gov.uk/check-long-term-flood-risk" target="_blank" rel="noreferrer">Environment Agency · check a property’s flood risk</a></div>;
}
const PHASES=[['All','All ages'],['Nursery','Nursery (under 5)'],['Primary','Primary (4–11)'],['Secondary','Secondary (11–16/18)'],['Special','Special schools'],['Pupil referral unit','Pupil referral units']];
// Which schools to show: age/stage, state or private, country, and inspection result.
// Shown in the box under the overlay bar and in the Map layers panel; both edit the same settings.
export function SchoolFilters({compact=false}:{compact?:boolean}){
  const [country,setCountry]=useViewField('country');const [sector,setSector]=useViewField('sector');
  const [rating,setRating]=useViewField('rating');const [reportArea,setReportArea]=useViewField('reportArea');const [phase,setPhase]=useViewField('phase');
  const english=country!=='Wales'&&country!=='Scotland';
  return <div className={compact?'school-filters compact':'school-filters'}>
    <label className="school-filter">Age / stage<select aria-label="School phase" value={phase} onChange={e=>setPhase(e.target.value)}>{PHASES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
    <label className="school-filter">State or private<select aria-label="School type" value={sector} onChange={e=>{setSector(e.target.value as typeof sector);if(e.target.value==='independent')setRating('all');}}><option value="all">State &amp; private</option><option value="state">State-funded</option><option value="independent">Private / independent</option></select></label>
    <label className="school-filter">Ofsted result{!english&&' (England only)'}<select disabled={!english||sector==='independent'} aria-label="Ofsted grade" value={rating} onChange={e=>setRating(e.target.value)}><option value="all">Any result</option><optgroup label="Overall grade">{[['1','Outstanding'],['2','Good'],['3','Requires improvement'],['4','Inadequate']].map(([value,label])=><option key={value} value={'legacy:'+value}>{label}</option>)}</optgroup><optgroup label="New report card (2025 onwards)">{['Exceptional','Strong standard','Expected standard','Needs attention','Urgent improvement'].map(grade=><option key={grade} value={'new:'+grade}>{grade}</option>)}</optgroup></select></label>
    {rating.startsWith('new:')&&<label className="school-filter">Report card area<select aria-label="Ofsted report area" value={reportArea} onChange={e=>setReportArea(e.target.value)}>{['Achievement','Curriculum and teaching','Inclusion','Attendance and behaviour','Personal development and wellbeing','Leadership and governance','Early years (where applicable)','Post-16 provision (where applicable)'].map(area=><option key={area}>{area}</option>)}</select></label>}
    <label className="school-filter">Country<select aria-label="School country" value={country} onChange={e=>{setCountry(e.target.value as typeof country);setRating('all');}}>{['all','England','Wales','Scotland'].map(c=><option key={c} value={c}>{c==='all'?'All countries':c}</option>)}</select></label>
    {!compact&&<p className="layer-status">S = state; I = independent. Wales: maintained schools (Estyn). Scotland: publicly funded schools (HM Inspectorate). Private school coverage is England only. Ofsted filters only include schools with an imported grade, so independent schools are left out. Older overall grades and newer report cards are separate.</p>}
  </div>;
}
const SHORT_LABEL:Record<LayerId,string>={schools:'Schools',catchments:'School catchments',property:'Sold house prices',crime:'Crime',parks:'Parks',amenities:'Shops & services',transport:'Transport stops',river:'River flooding',surface:'Surface water'};
// Every overlay as a one-click toggle above the map; detailed settings stay in the Map layers panel.
export function LayerBar({onChange}:{onChange?:(id:LayerId,on:boolean)=>void}){
  const [enabled,setEnabled]=useViewField('layers');
  return <><div className="layer-bar" role="group" aria-label="Map overlays"><span className="layer-bar-title">Overlays</span>{layerDefinitions.map(layer=>{const on=enabled.includes(layer.id);
    return <button key={layer.id} type="button" className={on?'layer-chip on':'layer-chip'} aria-pressed={on} style={{'--chip':layer.colour} as React.CSSProperties} onClick={()=>{setEnabled(old=>on?old.filter(v=>v!==layer.id):[...old,layer.id]);onChange?.(layer.id,!on);}}><i aria-hidden="true">{layer.symbol}</i>{SHORT_LABEL[layer.id]}</button>;})}</div>
    {(enabled.includes('schools')||enabled.includes('catchments'))&&<section className="school-box" aria-label="Which schools to show"><h3>Which schools?</h3><SchoolFilters compact/></section>}
    {enabled.includes('catchments')&&<p className="layer-bar-note" role="status">School catchment outlines cover the {CATCHMENT_COUNCILS.length} councils that publish them as open map data, including most of Scotland&apos;s cities, Hampshire, Wiltshire, Cheshire, Sheffield, Bristol and Stockport. Most Greater Manchester councils, Leeds and Birmingham don&apos;t publish theirs, so no outline doesn&apos;t mean no catchment. Zoom in to a town to see them.</p>}</>;
}
// The sold-prices layer's own range. Combined matches can optionally use it too.
function PriceRange(){
  const [price,setPrice]=useViewField('price');
  const [draft,setDraft]=useState({minimum:String(price.minimum),maximum:String(price.maximum)});
  const apply=(next:typeof draft)=>{setDraft(next);const minimum=Number(next.minimum),maximum=Number(next.maximum);if(Number.isFinite(minimum)&&Number.isFinite(maximum)&&minimum>=0&&maximum>0&&minimum<=maximum)setPrice(old=>({...old,minimum,maximum}));};
  return <div className="price-range"><label>From £<input type="number" min="0" step="10000" inputMode="numeric" aria-label="Minimum sold price" value={draft.minimum} onChange={e=>apply({...draft,minimum:e.target.value})}/></label><label>to £<input type="number" min="1" step="10000" inputMode="numeric" aria-label="Maximum sold price" value={draft.maximum} onChange={e=>apply({...draft,maximum:e.target.value})}/></label></div>;
}
export function MapLayers({map,open,onOpenChange}:{map:MapLibreMap|null;open?:boolean;onOpenChange?:(open:boolean)=>void}){
  const [country]=useViewField('country');const [sector]=useViewField('sector');const [catchmentSchool,setCatchmentSchool]=useViewField('catchmentSchool');
  const [rating]=useViewField('rating');const [reportArea]=useViewField('reportArea');
  const [enabled,setEnabled]=useViewField('layers');const [phase]=useViewField('phase');
  const {setView}=useSearchView();
  const showCatchment=useCallback((urn:string)=>{setView(old=>({...old,catchmentSchool:urn,phase:'All',layers:old.layers.includes('catchments')?old.layers:[...old.layers,'catchments']}));},[setView]);
  const toggle=(id:LayerId,checked:boolean)=>{setEnabled(old=>checked?[...old,id]:old.filter(value=>value!==id));};
  return <details className="map-layers" open={open} onToggle={event=>{onOpenChange?.((event.currentTarget as HTMLDetailsElement).open);}}><summary>Map layers <span>{enabled.length?`${enabled.length} on`:'Explore'}</span></summary><div className="layer-options"><p>Combine layers. Pan the map to refresh local data.</p>{layerDefinitions.map(layer=><div className="layer-row" key={layer.id}><label><input type="checkbox" checked={enabled.includes(layer.id)} onChange={e=>toggle(layer.id,e.target.checked)}/><i style={{background:layer.colour}}/>{layer.label}</label>{enabled.includes(layer.id)&&<>{layer.id==='property'&&<PriceRange/>}{layer.id==='schools'&&<SchoolFilters/>}{map?(layer.id==='catchments'?<CatchmentOverlay key={phase+catchmentSchool} map={map} phase={phase} school={catchmentSchool} onSchoolChange={setCatchmentSchool}/>:layer.id==='river'||layer.id==='surface'?<FloodOverlay map={map} kind={layer.id}/>:<PointOverlay key={layer.id==='schools'?`${phase}:${rating}:${reportArea}:${sector}:${country}`:layer.id} map={map} id={layer.id} country={country} sector={sector} onCatchment={showCatchment} phase={phase} rating={rating} reportArea={reportArea}/>):<small>Preparing map…</small>}</>}</div>)}</div></details>;
}
