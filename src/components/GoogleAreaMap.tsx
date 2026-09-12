"use client";
import {useEffect,useRef} from "react";
import type {GeoJSONSource,Map as MapLibreMap} from "maplibre-gl";
import {cellToBoundary} from "h3-js";
import type {LocationScore} from "@/src/types/domain";

const fill=(score:number)=>score>=88?"#64a955":score>=84?"#a5c95d":score>=80?"#d7bd55":"#d18154";
const feature=(result:LocationScore)=>({
 type:"Feature" as const,
 properties:{id:result.h3Index,score:result.overallScore,colour:fill(result.overallScore)},
 geometry:{type:"Polygon" as const,coordinates:[cellToBoundary(result.h3Index).map(([lat,lng])=>[lng,lat]).concat([cellToBoundary(result.h3Index)[0].slice().reverse()])]},
});

export function GoogleAreaMap({results,activeId,onSelect}:{results:LocationScore[];activeId:string;onSelect:(id:string)=>void}){
 const element=useRef<HTMLDivElement>(null);
 const mapRef=useRef<MapLibreMap|null>(null);
 const selectRef=useRef(onSelect);
 const activeRef=useRef(activeId);
 useEffect(()=>{selectRef.current=onSelect},[onSelect]);
 useEffect(()=>{activeRef.current=activeId},[activeId]);
 useEffect(()=>{
  if(!element.current)return;
  let disposed=false;
  import("maplibre-gl").then(({Map,NavigationControl})=>{
   if(disposed||!element.current)return;
   const map=new Map({container:element.current,center:[-2.24,53.49],zoom:8.5,style:{version:8,sources:{osm:{type:"raster",tiles:["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],tileSize:256,attribution:"© OpenStreetMap contributors"}},layers:[{id:"osm",type:"raster",source:"osm"}]}});
   map.addControl(new NavigationControl({showCompass:false}),"top-right");
   map.on("load",()=>{
    map.addSource("areas",{type:"geojson",data:{type:"FeatureCollection",features:results.map(feature)}});
    map.addLayer({id:"areas-fill",type:"fill",source:"areas",paint:{"fill-color":["get","colour"],"fill-opacity":["case",["==",["get","id"],activeRef.current],0.88,0.68]}});
    map.addLayer({id:"areas-line",type:"line",source:"areas",paint:{"line-color":"#fffdf8","line-width":["case",["==",["get","id"],activeRef.current],4,2]}});
    map.on("click","areas-fill",event=>{const id=event.features?.[0]?.properties?.id;if(id)selectRef.current(id)});
    map.on("mouseenter","areas-fill",()=>{map.getCanvas().style.cursor="pointer"});
    map.on("mouseleave","areas-fill",()=>{map.getCanvas().style.cursor=""});
   });
   mapRef.current=map;
  });
  return()=>{disposed=true;mapRef.current?.remove();mapRef.current=null};
 },[results]);
 useEffect(()=>{
  const map=mapRef.current;
  if(!map?.isStyleLoaded())return;
  const source=map.getSource("areas") as GeoJSONSource|undefined;
  if(source)source.setData({type:"FeatureCollection",features:results.map(feature)});
  map.setPaintProperty("areas-fill","fill-opacity",["case",["==",["get","id"],activeId],0.88,0.68]);
  map.setPaintProperty("areas-line","line-width",["case",["==",["get","id"],activeId],4,2]);
 },[activeId,results]);
 return <div ref={element} className="google-map-canvas ready" aria-label="OpenStreetMap with live suitability areas"/>;
}
