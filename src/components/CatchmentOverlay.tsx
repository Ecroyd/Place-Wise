"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Map as MapLibreMap} from 'maplibre-gl';
import {catchmentBounds,catchmentCoverage,type CatchmentData} from '@/src/lib/data/catchments';
import type {ViewBounds} from '@/src/lib/data/layers';

// Straight-line rings for schools without a published catchment: many councils (most of
// Greater Manchester, for example) rank applicants by home-to-school distance as the crow flies.
export const DISTANCE_RINGS_M=[500,1000,1500,2000,3000];
export function ringPolygon(centre:{latitude:number;longitude:number},metres:number,steps=72):[number,number][]{
  const lat=centre.latitude*Math.PI/180,lon=centre.longitude*Math.PI/180,angle=metres/6371000;
  return Array.from({length:steps+1},(_,i)=>{const bearing=i/steps*2*Math.PI;
    const la=Math.asin(Math.sin(lat)*Math.cos(angle)+Math.cos(lat)*Math.sin(angle)*Math.cos(bearing));
    const lo=lon+Math.atan2(Math.sin(bearing)*Math.sin(angle)*Math.cos(lat),Math.cos(angle)-Math.sin(lat)*Math.sin(la));
    return [lo*180/Math.PI,la*180/Math.PI];});
}
function DistanceRings({map,centre}:{map:MapLibreMap;centre:{latitude:number;longitude:number}}){
  useEffect(()=>{
    let cancelled=false;const markers:{remove:()=>void}[]=[];
    // The rings themselves are drawn in the outline overlay; these are their labels.
    const add=()=>{if(cancelled)return;
      void import('maplibre-gl').then(({Marker})=>{if(cancelled)return;for(const m of DISTANCE_RINGS_M){const label=document.createElement('span');label.className='distance-ring-label';label.textContent=m<1000?`${m} m`:`${m/1000} km`;
        const [lng,lat]=ringPolygon(centre,m,4)[0];markers.push(new Marker({element:label}).setLngLat([lng,lat]).addTo(map));}});
      const bounds=ringPolygon(centre,DISTANCE_RINGS_M[DISTANCE_RINGS_M.length-1],8);
      map.fitBounds([[Math.min(...bounds.map(p=>p[0])),Math.min(...bounds.map(p=>p[1]))],[Math.max(...bounds.map(p=>p[0])),Math.max(...bounds.map(p=>p[1]))]],{padding:60,maxZoom:15});
    };
    add();
    return()=>{cancelled=true;markers.forEach(m=>m.remove());};
  },[map,centre]);
  return null;
}

export function CatchmentOverlay({map,area,phase,school,schoolPoint,onSchoolChange}:{map:MapLibreMap;area?:ViewBounds;phase:string;school:string;schoolPoint?:{latitude:number;longitude:number;name:string};onSchoolChange:(urn:string)=>void}){
  const [retry,setRetry]=useState(0);
  const params=area?new URLSearchParams({west:String(area.west),east:String(area.east),south:String(area.south),north:String(area.north),phase,school}).toString():'';
  const requestKey=params+'#'+retry;
  // Keep the last answer on screen while a new view loads, so rings and outlines don't flicker.
  const [result,setResult]=useState<{key:string;data?:CatchmentData;error?:string}>();
  const [last,setLast]=useState<CatchmentData>();
  const loading=!!params&&result?.key!==requestKey;const error=result?.key===requestKey?result.error??'':'';const data=result?.key===requestKey&&result.data?result.data:last;
  const [paths,setPaths]=useState<{id:string;d:string;name:string;associated:boolean;ring?:boolean}[]>([]);
  const group=useRef<SVGGElement>(null);const fitted=useRef('');
  // Fetch for the applied view (see "Apply overlays to this view"), or the chosen school's outline.
  useEffect(()=>{
    if(!params)return;const active=new AbortController();
    void fetch('/api/catchments?'+params,{signal:active.signal}).then(async r=>{const payload=await r.json();if(!r.ok)throw Error(payload.error);if(!active.signal.aborted){setResult({key:requestKey,data:payload});setLast(payload);}}).catch(e=>{if(!active.signal.aborted)setResult({key:requestKey,error:e instanceof Error?e.message:'Unavailable'});});
    return()=>active.abort();
  },[params,requestKey]);
  useEffect(()=>{
    let cancelled=false;let sync:(()=>void)|undefined;
    if(!data)return;
    void import('maplibre-gl').then(({MercatorCoordinate})=>{
      if(cancelled)return;
      const units=65536;const anchor=MercatorCoordinate.fromLngLat([map.getCenter().lng,map.getCenter().lat]);
      const basis=[anchor,new MercatorCoordinate(anchor.x+1/units,anchor.y),new MercatorCoordinate(anchor.x,anchor.y+1/units)].map(p=>p.toLngLat());
      const project=(p:number[])=>{const point=MercatorCoordinate.fromLngLat([p[0],p[1]]);return ((point.x-anchor.x)*units)+','+((point.y-anchor.y)*units);};
      const rings=school&&schoolPoint&&!data.features.length?DISTANCE_RINGS_M.map(m=>({id:'ring-'+m,name:`${m<1000?m+' m':m/1000+' km'} as the crow flies`,associated:false,ring:true,d:ringPolygon(schoolPoint,m).map((p,k)=>(k?'L':'M')+project(p)).join(' ')+' Z'})):[];
      setPaths([...data.features.map(f=>({id:f.properties.id,name:f.properties.name,associated:f.properties.category!=='Catchment',d:(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).map(polygon=>polygon.map(ring=>ring.map((p,i)=>{const point=MercatorCoordinate.fromLngLat([p[0],p[1]]);return (i?'L':'M')+((point.x-anchor.x)*units)+','+((point.y-anchor.y)*units);}).join(' ')+' Z').join(' ')).join(' ')})),...rings]);
      sync=()=>{if(!group.current)return;const [o,x,y]=basis.map(p=>map.project(p));group.current.setAttribute('transform','matrix('+(x.x-o.x)+' '+(x.y-o.y)+' '+(y.x-o.x)+' '+(y.y-o.y)+' '+o.x+' '+o.y+')');};
      map.on('render',sync);sync();map.triggerRepaint();
      if(school&&fitted.current!==school&&data.features.length){fitted.current=school;const boxes=data.features.map(f=>catchmentBounds(f.geometry));map.fitBounds([[Math.min(...boxes.map(b=>b.west)),Math.min(...boxes.map(b=>b.south))],[Math.max(...boxes.map(b=>b.east)),Math.max(...boxes.map(b=>b.north))]],{padding:55,maxZoom:15});}
      if(!school)fitted.current='';
    });return()=>{cancelled=true;if(sync)map.off('render',sync);};
  },[map,data,school,schoolPoint]);
  const target=map.getContainer().parentElement;
  // Keep the rings while a map move reloads outlines; the previous answer stays until a new one arrives.
  const noBoundary=!!school&&!!schoolPoint&&!error&&!!data&&!data.features.length;
  return <>{noBoundary&&<DistanceRings map={map} centre={schoolPoint}/>}{noBoundary&&target&&createPortal(<p className="distance-ring-card" role="status"><b>No published catchment for {schoolPoint.name}.</b> Many councils offer places by straight-line distance from home to school, so the dashed rings show 0.5–3 km as the crow flies. How far a school reaches changes each year; look up its “last distance offered” on the council&apos;s admissions pages.</p>,target)}<div className="layer-status" aria-live="polite">

<p>{school ? data?.features[0]?.properties.name ?? 'Selected school' : 'Click a school pin to show its catchment.'} {school && <button onClick={()=>onSchoolChange('')}>Show all boundaries</button>}</p>
    {loading?'Loading published boundaries…':error?<span role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></span>:data?.tooWide?<p>Zoom in to a town to see catchment outlines.</p>:<p>{data?.features.length??0} outlines. {!data?.features.length?'No published boundary in this view. Many councils don’t publish catchments as map data, and some admit by distance instead.':''}</p>}
    <p>Coverage: {catchmentCoverage()}. Solid purple = catchment; dashed teal = other admission areas (Catholic associated, priority, community or designated areas). Click a school pin to isolate its outline.</p>
    <p>Published council boundaries; retrieved {data?.retrievedAt??'2026-11-23'}. Being inside one doesn&apos;t guarantee a place. Check the address and intake year with the council.</p>
    {data?.features[0]&&<a href={data.features[0].properties.sourceUrl} target="_blank" rel="noreferrer">{data.features[0].properties.council} council admissions</a>}
  </div>{target&&createPortal(<svg aria-label="Published school catchment outlines" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:2}}><g ref={group}>{paths.map(p=><path key={p.id} d={p.d} fill="none" stroke={p.associated?'#087c88':'#75329d'} strokeWidth={p.ring?2:school?4:2.5} strokeDasharray={p.associated?'7 5':p.ring?'6 5':undefined} vectorEffect="non-scaling-stroke"><title>{p.name}</title></path>)}</g></svg>,target)}</>;
}
