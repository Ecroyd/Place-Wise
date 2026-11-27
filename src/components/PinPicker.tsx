"use client";
import {useEffect,useRef,useState} from 'react';
import type {Map as MapLibreMap,Marker} from 'maplibre-gl';
import {authHeaders} from '@/src/lib/supabase/browser';

export type Pin={latitude:number;longitude:number;label:string};
type Point={latitude:number;longitude:number};
const UK={latitude:54.2,longitude:-2.6,zoom:5};

// A map in a dialog: tap or click the exact spot you travel to, drag the pin to fine-tune it,
// then "Use this spot". The search then starts from those coordinates instead of a looked-up address.
export function PinPicker({initial,near,onPick,onClose}:{initial?:Pin;near?:string;onPick:(pin:Pin)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null);
 const element=useRef<HTMLDivElement>(null);
 const mapRef=useRef<MapLibreMap|null>(null);
 const markerRef=useRef<Marker|null>(null);
 const placeRef=useRef<(p:Point)=>void>(undefined);
 const [point,setPoint]=useState<Point|undefined>(initial);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');

 useEffect(()=>{dialog.current?.showModal();},[]);
 useEffect(()=>{
  let cancelled=false;
  void import('maplibre-gl').then(async maplibre=>{
   if(cancelled||!element.current)return;
   let start:{latitude:number;longitude:number;zoom:number}=initial?{...initial,zoom:15}:UK;
   // Open near whatever is typed in the destination box, so the pin is a nudge, not a hunt.
   if(!initial&&near&&near.trim().length>=2){
    const found=await fetch('/api/geocode',{method:'POST',headers:{'Content-Type':'application/json',...await authHeaders()},body:JSON.stringify({address:near})}).then(r=>r.ok?r.json():null).catch(()=>null) as Point|null;
    if(found&&typeof found.latitude==='number')start={latitude:found.latitude,longitude:found.longitude,zoom:13};
   }
   if(cancelled||!element.current)return;
   const map=new maplibre.Map({container:element.current,center:[start.longitude,start.latitude],zoom:start.zoom,maxPitch:0,pitchWithRotate:false,dragRotate:false,
    style:{version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]}});
   mapRef.current=map;
   map.addControl(new maplibre.NavigationControl({showCompass:false}),'top-right');
   const place=(p:Point)=>{
    setPoint(p);
    if(!markerRef.current){
     const marker=new maplibre.Marker({draggable:true,color:'#d94f30'}).setLngLat([p.longitude,p.latitude]).addTo(map);
     marker.on('dragend',()=>{const at=marker.getLngLat();setPoint({latitude:at.lat,longitude:at.lng});});
     markerRef.current=marker;
    }else markerRef.current.setLngLat([p.longitude,p.latitude]);
   };
   placeRef.current=place;
   if(initial)place(initial);
   map.on('click',event=>place({latitude:event.lngLat.lat,longitude:event.lngLat.lng}));
  });
  return()=>{cancelled=true;markerRef.current=null;mapRef.current?.remove();mapRef.current=null;};
  // The map is built once when the dialog opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);

 function myLocation(){
  if(!navigator.geolocation){setMessage('Your browser can’t share its location.');return;}
  setMessage('Finding you…');
  navigator.geolocation.getCurrentPosition(position=>{
   const p={latitude:position.coords.latitude,longitude:position.coords.longitude};
   setMessage('');mapRef.current?.flyTo({center:[p.longitude,p.latitude],zoom:16});
   placeRef.current?.(p);
  },()=>setMessage('Location wasn’t shared. Tap the map instead.'),{enableHighAccuracy:true,timeout:10000});
 }

 async function confirm(){
  if(!point)return;
  setBusy(true);
  const named=await fetch('/api/geocode',{method:'POST',headers:{'Content-Type':'application/json',...await authHeaders()},body:JSON.stringify(point)}).then(r=>r.ok?r.json():null).catch(()=>null) as {label?:string}|null;
  setBusy(false);
  onPick({...point,label:named?.label??`Dropped pin (${point.latitude.toFixed(4)}, ${point.longitude.toFixed(4)})`});
 }

 return <dialog ref={dialog} className="pin-dialog" onClose={onClose} aria-labelledby="pin-title">
  <div className="pin-head"><h2 id="pin-title">Drop a pin on your destination</h2><button type="button" className="link-button" onClick={()=>dialog.current?.close()} aria-label="Close">✕</button></div>
  <p className="pin-help">Tap the exact spot you travel to: an office, school gate or station entrance. Drag the pin to adjust it.</p>
  <div className="pin-map" ref={element}/>
  <div className="pin-actions">
   <button type="button" className="btn light" onClick={myLocation}>◎ Use my location</button>
   {message&&<small role="status">{message}</small>}
   <button type="button" className="btn primary" disabled={!point||busy} onClick={()=>void confirm()}>{busy?'Saving…':point?'Use this spot':'Tap the map first'}</button>
  </div>
 </dialog>;
}
