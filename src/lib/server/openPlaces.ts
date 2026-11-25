import {readFile} from 'node:fs/promises';
import path from 'node:path';
import type {LayerData,LayerPoint,ViewBounds} from '@/src/lib/data/layers';

// Stored open data behind the parks, shops & services and transport overlays (built by
// scripts/refresh-open-places.mjs from Overture Maps and NaPTAN), so these layers no longer
// depend on the public Overpass servers being up.
export type OpenLayer='parks'|'amenities'|'transport';
export interface OpenDataset{source:string;licence:string;sourceUrl:string;builtAt:string;types:string[];strings:string[];points:number[][]}

// Each file is read with a fixed literal path (the same pattern as the catchments route) so the
// bundler can see exactly which files to ship. A computed path makes it bundle the whole project,
// whose ESM package.json then breaks the route on Vercel.
function read(layer:OpenLayer):Promise<string>{
 if(layer==='amenities')return readFile(path.join(process.cwd(),'src/data/open-amenities.json'),'utf8');
 if(layer==='parks')return readFile(path.join(process.cwd(),'src/data/open-parks.json'),'utf8');
 return readFile(path.join(process.cwd(),'src/data/open-transport.json'),'utf8');
}
const loaded=new Map<OpenLayer,Promise<OpenDataset>>();
export function loadOpenLayer(layer:OpenLayer){
 let data=loaded.get(layer);
 if(!data){data=read(layer).then(text=>JSON.parse(text) as OpenDataset);data.catch(()=>loaded.delete(layer));loaded.set(layer,data);}
 return data;
}

export const OPEN_LAYER_LIMIT=350;
// Points are sorted by latitude: binary-search the south edge, then scan to the north edge.
// Types that give way to everything else when a view has more points than the limit.
const MINOR_TYPES=new Set(['Bus stop']);
export const DECLUTTER_COLUMNS=20;
export function openPointsInView(data:OpenDataset,b:ViewBounds,limit=OPEN_LAYER_LIMIT):{points:LayerPoint[];total:number;thinned:number}{
 const minor=new Set(data.types.flatMap((t,i)=>MINOR_TYPES.has(t)?[i]:[]));
 const south=Math.round(b.south*1e5),north=Math.round(b.north*1e5),west=Math.round(b.west*1e5),east=Math.round(b.east*1e5);
 let low=0,high=data.points.length;
 while(low<high){const mid=(low+high)>>1;if(data.points[mid][0]<south)low=mid+1;else high=mid;}
 const found:number[][]=[];
 for(let i=low;i<data.points.length&&data.points[i][0]<=north;i++){const p=data.points[i];if(p[1]>=west&&p[1]<=east)found.push(p);}
 // Bus stops pile up when zoomed out, so keep at most one per pin-sized cell of the view
 // (DECLUTTER_COLUMNS across, about 30 px apart). Zoomed in the cells are tiny and every stop shows.
 // Stations and other main types are never thinned.
 const cellX=Math.max(1,(east-west)/DECLUTTER_COLUMNS),cellY=Math.max(1,cellX*Math.cos(((b.south+b.north)/2)*Math.PI/180));
 const taken=new Set<string>();let thinned=0;
 const visible=found.filter(p=>{if(!minor.has(p[2]))return true;const key=Math.floor((p[0]-south)/cellY)+':'+Math.floor((p[1]-west)/cellX);if(taken.has(key)){thinned++;return false;}taken.add(key);return true;});
 // Too many to show: keep the important kinds first (e.g. stations before bus stops), then
 // those nearest the middle of the view.
 const cy=(south+north)/2,cx=(west+east)/2,scale=Math.cos(((b.south+b.north)/2)*Math.PI/180);
 const rank=(p:number[])=>minor.has(p[2])?1:0;
 const shown=visible.length>limit?[...visible].sort((a,c)=>rank(a)-rank(c)||((a[0]-cy)**2+((a[1]-cx)*scale)**2)-((c[0]-cy)**2+((c[1]-cx)*scale)**2)).slice(0,limit):visible;
 return {total:found.length,thinned,points:shown.map(p=>{
  const type=data.types[p[2]];const name=data.strings[p[3]]||type;const extra=p[4]===undefined?undefined:data.strings[p[4]];
  return {id:`${p[0]},${p[1]},${p[2]}`,name,latitude:p[0]/1e5,longitude:p[1]/1e5,details:[type,...(extra?[extra]:[])],
   url:`https://www.openstreetmap.org/?mlat=${p[0]/1e5}&mlon=${p[1]/1e5}#map=18/${p[0]/1e5}/${p[1]/1e5}`,urlLabel:'View on map'};
 })};
}

export async function openLayer(layer:OpenLayer,b:ViewBounds):Promise<LayerData>{
 const data=await loadOpenLayer(layer);
 const {points,total,thinned}=openPointsInView(data,b);
 return {points,total,source:`${data.source} · ${data.licence}`,sourceUrl:data.sourceUrl,
  note:`${thinned?'Bus stops thinned out at this zoom so they don’t overlap; zoom in to see them all. ':''}${total-thinned>points.length?`${points.length} of ${total} nearest the map centre; zoom in for more. `:''}Stored open data, updated ${data.builtAt}; listings can be out of date. Click a pin for details.`};
}
