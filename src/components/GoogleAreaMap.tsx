"use client";

import { useEffect, useRef, useState } from "react";
import type { LocationScore } from "@/src/types/domain";

declare global {
  interface Window { google?: GoogleMapsNamespace; __placewiseGoogleMaps?: Promise<void> }
}
interface GooglePolygon { setMap(map:null):void }
interface GoogleMap { fitBounds(bounds:GoogleBounds):void }
interface GoogleBounds { extend(point:{lat:number;lng:number}):void }
interface GoogleMapsNamespace {
  maps:{
    Map:new(element:HTMLElement,options:Record<string,unknown>)=>GoogleMap;
    Polygon:new(options:Record<string,unknown>)=>GooglePolygon&{addListener(name:string,callback:()=>void):void};
    LatLngBounds:new()=>GoogleBounds;
  }
}

function loadGoogleMaps(key:string) {
  if (window.google?.maps) return Promise.resolve();
  if (window.__placewiseGoogleMaps) return window.__placewiseGoogleMaps;
  window.__placewiseGoogleMaps = new Promise((resolve,reject)=>{
    const script=document.createElement("script");
    script.src=`https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async`;
    script.async=true;script.defer=true;script.onload=()=>resolve();script.onerror=()=>reject(new Error("Google Maps failed to load"));
    document.head.appendChild(script);
  });
  return window.__placewiseGoogleMaps;
}

const fill=(score:number)=>score>=88?"#64a955":score>=84?"#a5c95d":score>=80?"#d7bd55":"#d18154";
const hex=(lat:number,lng:number,r=.027)=>Array.from({length:6},(_,i)=>{const a=Math.PI/3*i;return {lat:lat+Math.sin(a)*r,lng:lng+Math.cos(a)*r*1.55};});

export function GoogleAreaMap({results,activeId,onSelect}:{results:LocationScore[];activeId:string;onSelect:(id:string)=>void}) {
  const element=useRef<HTMLDivElement>(null);
  const polygons=useRef<GooglePolygon[]>([]);
  const [state,setState]=useState<"loading"|"ready"|"fallback">(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?"loading":"fallback");
  useEffect(()=>{
    const key=process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if(!key||!element.current){setState("fallback");return;}
    let cancelled=false;
    loadGoogleMaps(key).then(()=>{
      if(cancelled||!element.current||!window.google)return;
      const {Map,Polygon,LatLngBounds}=window.google.maps;
      const map=new Map(element.current,{center:{lat:53.49,lng:-2.2},zoom:9,mapTypeControl:false,streetViewControl:false,fullscreenControl:false,styles:[{featureType:"poi",stylers:[{visibility:"off"}]},{featureType:"transit",elementType:"labels",stylers:[{visibility:"on"}]}]});
      const bounds=new LatLngBounds();
      polygons.current=results.map(result=>{
        bounds.extend({lat:result.cell.latitude,lng:result.cell.longitude});
        const polygon=new Polygon({paths:hex(result.cell.latitude,result.cell.longitude),strokeColor:"#fffdf8",strokeOpacity:.9,strokeWeight:result.h3Index===activeId?4:2,fillColor:fill(result.overallScore),fillOpacity:result.h3Index===activeId?.9:.7,map});
        polygon.addListener("click",()=>onSelect(result.h3Index));return polygon;
      });
      map.fitBounds(bounds);setState("ready");
    }).catch(()=>setState("fallback"));
    return()=>{cancelled=true;polygons.current.forEach(p=>p.setMap(null));polygons.current=[];};
  },[results,activeId,onSelect]);
  return <><div ref={element} className={`google-map-canvas ${state==="ready"?"ready":""}`} aria-label="Google map with suitability areas"/>{state==="loading"&&<div className="map-status">Loading Google Maps…</div>}{state==="fallback"&&<div className="map-status fallback">Demo map · Add a restricted Google Maps key to enable the live basemap</div>}</>;
}
