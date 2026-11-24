import land from '@/src/data/land-british-isles.json';
import {cellToBoundary,cellToChildren,cellToLatLng,getResolution} from 'h3-js';

// Natural Earth 1:10m land (public domain), trimmed to the British Isles. Used so the
// heatmap never samples or shades the sea: without it, a checked point on the coast paints
// the estuary or bay beside it (e.g. the Dee between the Wirral and Flint).
type Ring=[number,number][];
// Each ring's edges are bucketed into thin latitude bands, so a point test only looks at the
// few edges crossing its latitude instead of the whole coastline (thousands of points).
const BAND=0.02;
type Edge=[number,number,number,number];
function index(ring:Ring){
 const bands=new Map<number,Edge[]>();
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){const [x1,y1]=ring[j],[x2,y2]=ring[i];
  for(let b=Math.floor(Math.min(y1,y2)/BAND);b<=Math.floor(Math.max(y1,y2)/BAND);b++){(bands.get(b)??bands.set(b,[]).get(b)!).push([x1,y1,x2,y2]);}}
 return bands;
}
const polygons=(land.coordinates as unknown as Ring[][]).map(rings=>{
 let w=180,e=-180,s=90,n=-90;for(const [x,y] of rings[0]){if(x<w)w=x;if(x>e)e=x;if(y<s)s=y;if(y>n)n=y;}
 return {rings:rings.map(index),w,e,s,n};
});
const box={w:-11,e:2.5,s:49.8,n:61.5};
function inRing(x:number,y:number,ring:Map<number,Edge[]>){let inside=false;for(const [xj,yj,xi,yi] of ring.get(Math.floor(y/BAND))??[]){if((yi>y)!==(yj>y)&&x<(xj-xi)*(y-yi)/(yj-yi)+xi)inside=!inside;}return inside;}
// Outside the British Isles there is no outline, so everything counts as land there.
export function onLand(point:{latitude:number;longitude:number}){
 const x=point.longitude,y=point.latitude;
 if(x<box.w||x>box.e||y<box.s||y>box.n)return true;
 return polygons.some(p=>x>=p.w&&x<=p.e&&y>=p.s&&y<=p.n&&inRing(x,y,p.rings[0])&&!p.rings.slice(1).some(h=>inRing(x,y,h)));
}
const cellOnLand=(id:string)=>{const [latitude,longitude]=cellToLatLng(id);return onLand({latitude,longitude});};
// Coastal cells are split (down to ~0.7 km²) so shading follows the shore; open-sea cells are dropped.
export function landTiles(ids:string[],finest=8):string[]{
 const out:string[]=[];
 const visit=(id:string)=>{
  const corners=cellToBoundary(id).map(([latitude,longitude])=>onLand({latitude,longitude}));
  const centre=cellOnLand(id);
  if(corners.every(c=>c===centre)){if(centre)out.push(id);return;}
  if(getResolution(id)>=finest){if(centre)out.push(id);return;}
  for(const child of cellToChildren(id,getResolution(id)+1))visit(child);
 };
 for(const id of ids)visit(id);
 return out;
}
