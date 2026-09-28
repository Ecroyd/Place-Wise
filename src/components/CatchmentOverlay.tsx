"use client";
import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import type {Map as MapLibreMap} from 'maplibre-gl';
import {catchmentBounds,type CatchmentData} from '@/src/lib/data/catchments';

export function CatchmentOverlay({map,phase,school,onSchoolChange}:{map:MapLibreMap;phase:string;school:string;onSchoolChange:(urn:string)=>void}){
  const [data,setData]=useState<CatchmentData>();const [error,setError]=useState('');const [loading,setLoading]=useState(true);const [retry,setRetry]=useState(0);
  const [paths,setPaths]=useState<{id:string;d:string;name:string;associated:boolean}[]>([]);
  const group=useRef<SVGGElement>(null);const fitted=useRef('');
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>;let controller:AbortController|undefined;
    const update=()=>{clearTimeout(timer);controller?.abort();timer=setTimeout(()=>{
      const b=map.getBounds();const active=new AbortController();controller=active;setLoading(true);setError('');
      const params=new URLSearchParams({west:String(b.getWest()),east:String(b.getEast()),south:String(b.getSouth()),north:String(b.getNorth()),phase,school});
      void fetch('/api/catchments?'+params,{signal:active.signal}).then(async r=>{const payload=await r.json();if(!r.ok)throw Error(payload.error);if(!active.signal.aborted)setData(payload);}).catch(e=>{if(!active.signal.aborted)setError(e.message);}).finally(()=>{if(!active.signal.aborted)setLoading(false);});
    },300);};
    update();map.on('moveend',update);return()=>{clearTimeout(timer);controller?.abort();map.off('moveend',update);};
  },[map,phase,school,retry]);
  useEffect(()=>{
    let cancelled=false;let sync:(()=>void)|undefined;
    if(!data)return;
    void import('maplibre-gl').then(({MercatorCoordinate})=>{
      if(cancelled)return;
      const units=65536;const anchor=MercatorCoordinate.fromLngLat([map.getCenter().lng,map.getCenter().lat]);
      const basis=[anchor,new MercatorCoordinate(anchor.x+1/units,anchor.y),new MercatorCoordinate(anchor.x,anchor.y+1/units)].map(p=>p.toLngLat());
      setPaths(data.features.map(f=>({id:f.properties.id,name:f.properties.name,associated:f.properties.category!=='Catchment',d:(f.geometry.type==='Polygon'?[f.geometry.coordinates]:f.geometry.coordinates).map(polygon=>polygon.map(ring=>ring.map((p,i)=>{const point=MercatorCoordinate.fromLngLat([p[0],p[1]]);return (i?'L':'M')+((point.x-anchor.x)*units)+','+((point.y-anchor.y)*units);}).join(' ')+' Z').join(' ')).join(' ')})));
      sync=()=>{if(!group.current)return;const [o,x,y]=basis.map(p=>map.project(p));group.current.setAttribute('transform','matrix('+(x.x-o.x)+' '+(x.y-o.y)+' '+(y.x-o.x)+' '+(y.y-o.y)+' '+o.x+' '+o.y+')');};
      map.on('render',sync);sync();map.triggerRepaint();
      if(school&&fitted.current!==school&&data.features.length){fitted.current=school;const boxes=data.features.map(f=>catchmentBounds(f.geometry));map.fitBounds([[Math.min(...boxes.map(b=>b.west)),Math.min(...boxes.map(b=>b.south))],[Math.max(...boxes.map(b=>b.east)),Math.max(...boxes.map(b=>b.north))]],{padding:55,maxZoom:15});}
      if(!school)fitted.current='';
    });return()=>{cancelled=true;if(sync)map.off('render',sync);};
  },[map,data,school]);
  const target=map.getContainer().parentElement;
  return <><div className="layer-status" aria-live="polite">
<p>{school ? data?.features[0]?.properties.name ?? 'Selected school' : 'Click a school pin to show its catchment.'} {school && <button onClick={()=>onSchoolChange('')}>Show all boundaries</button>}</p>
    {loading?'Loading published boundaries…':error?<span role="alert">{error} <button onClick={()=>setRetry(n=>n+1)}>Retry</button></span>:<p>{data?.features.length??0} outlines. {!data?.features.length?'No published boundary in this dataset for this school or view. This does not mean there is no catchment.':''}</p>}
    <p>Coverage: Stockport only. Solid purple = catchment; dashed teal = Catholic associated area. Click a school pin to isolate its outline. These boundaries are separate from the school inspection filters.</p>
    <p>Published council geometry; retrieved {data?.retrievedAt??'2026-09-28'}. Admission year is not specified by the map feed. Being inside does not guarantee admission; verify the address and intake year with the council.</p>
    <a href="https://www.stockport.gov.uk/find-your-catchment-area" target="_blank" rel="noreferrer">Council map and address checker</a>
  </div>{target&&createPortal(<svg aria-label="Published school catchment outlines" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:2}}><g ref={group}>{paths.map(p=><path key={p.id} d={p.d} fill="none" stroke={p.associated?'#087c88':'#75329d'} strokeWidth={school?4:2.5} strokeDasharray={p.associated?'7 5':undefined} vectorEffect="non-scaling-stroke"><title>{p.name}</title></path>)}</g></svg>,target)}</>;
}
