import type {DestinationConstraint} from '@/src/types/domain';
import {cellsToMultiPolygon,getResolution,latLngToCell} from 'h3-js';
import {distanceKm,sampleOrigin,samplingRadiusKm,type commuteGrid} from './commute';
import {landTiles,onLand} from './land';
export const OVERVIEW_ROUTE_BUDGET=96;
export const DETAIL_ROUTE_BUDGET=48;
// Open routing (OpenRouteService) is free and answers ~50 points per call, so untimed
// drives, walks and cycles can afford a much denser map than paid Google routing.
export const OPEN_OVERVIEW_ROUTE_BUDGET=384;
export const OPEN_CELLS_PER_REQUEST=48;
export const PAID_CELLS_PER_REQUEST=16;
export function freeRouting(destinations:DestinationConstraint[]){
 return destinations.every(d=>d.transportMode==='walk'||d.transportMode==='cycle'||((d.transportMode==='drive'||d.transportMode==='any')&&!d.departureTime));
}
export function overviewBudget(destinations:DestinationConstraint[]){return freeRouting(destinations)?OPEN_OVERVIEW_ROUTE_BUDGET:OVERVIEW_ROUTE_BUDGET;}
export function cellsPerRequest(destinations:DestinationConstraint[]){return freeRouting(destinations)?OPEN_CELLS_PER_REQUEST:PAID_CELLS_PER_REQUEST;}
export function sampleLimit(destinations:DestinationConstraint[],budget=OVERVIEW_ROUTE_BUDGET){
 const weight=destinations.reduce((sum,d)=>sum+(d.transportMode==='any'?5:d.transportMode==='transit'||d.transportMode==='mixed'?2:1),0);
 return Math.max(1,Math.floor(budget/Math.max(1,weight)));
}
// Keep small cells and actual routed centres; never colour untested gaps.
// Weighted farthest-point selection: samples sit closest together near the
// destination, where short commutes vary most, and spread out with distance.
export function overviewSamples(grid:ReturnType<typeof commuteGrid>,destinations:DestinationConstraint[],budget=OVERVIEW_ROUTE_BUDGET){
 const points=grid.features.map(feature=>({id:feature.properties.id,point:sampleOrigin(feature.properties.id),nearest:Infinity,weight:1})).filter(({point})=>destinations.every(d=>d.maximumDistanceKm===undefined||distanceKm(point,d)<=d.maximumDistanceKm+1));
 // Never spend a route check on open water.
 const dry=points.filter(item=>onLand(item.point));if(dry.length)points.splice(0,points.length,...dry);
 const limit=sampleLimit(destinations,budget);if(points.length<=limit)return points.map(p=>p.id);
 // Spacing grows roughly linearly with distance: about 12x wider at the edge than at the centre.
 const core=Math.max(1,Math.min(...destinations.map(samplingRadiusKm))*0.09);
 for(const item of points){const km=Math.min(...destinations.map(d=>distanceKm(item.point,d)));item.weight=((core+km)/core)**2;}
 const selected:string[]=[];let next=points.reduce((best,item,i)=>item.weight<points[best].weight?i:best,0);const scale=Math.cos(points[0].point.latitude*Math.PI/180);
 for(let i=0;i<limit;i++){const chosen=points[next];selected.push(chosen.id);chosen.nearest=-1;let greatest=-1;
  for(let j=0;j<points.length;j++){const item=points[j];if(item.nearest<0)continue;const delta=((item.point.latitude-chosen.point.latitude)**2+((item.point.longitude-chosen.point.longitude)*scale)**2)/item.weight;item.nearest=Math.min(item.nearest,delta);if(item.nearest>greatest){greatest=item.nearest;next=j;}}
 }
 return selected;
}

// Each overview sample stands for the area closest to it. Tile the sampling area with
// small hexagons, give each to its nearest routed sample, and merge each sample's tiles
// into one shape: small patches near the destination, larger ones further out, no gaps
// or overlaps. Properties keep the routed sample's id so colouring and clicks use real times.
type Grid=ReturnType<typeof commuteGrid>;
export function overviewDisplayGrid(grid:Grid,ids:string[],destinations:DestinationConstraint[]=[]):Grid&{cellFor:Map<string,string>}{
 const cellFor=new Map<string,string>();
 if(!ids.length||!grid.features.length)return {...grid,features:[],cellFor};
 // Only the area that was actually sampled: inside every destination's distance limit, on land.
 const inLimits=(point:{latitude:number;longitude:number})=>destinations.every(d=>d.maximumDistanceKm===undefined||distanceKm(point,d)<=d.maximumDistanceKm+1);
 const tiles=landTiles(grid.features.map(f=>f.properties.id)).filter(tile=>inLimits(sampleOrigin(tile)));
 const samples=ids.map(id=>({id,...sampleOrigin(id)}));
 const scale=Math.cos(samples[0].latitude*Math.PI/180);
 // A point may only stand for ground close to it: at most 3/4 of the gap to its nearest
 // neighbour (and never under 1.5 km), so no tile borrows a time from far away.
 const reach=new Map(samples.map(a=>{let gap=Infinity;for(const b of samples)if(b!==a){const d=(a.latitude-b.latitude)**2+((a.longitude-b.longitude)*scale)**2;if(d<gap)gap=d;}return [a.id,Math.max(1.5/111,Math.sqrt(gap)*0.75)**2];}));
 // Bucket samples on a coarse lat/lng grid so each tile only checks nearby samples.
 const lats=samples.map(s=>s.latitude),lngs=samples.map(s=>s.longitude);
 const south=Math.min(...lats),west=Math.min(...lngs);
 const size=Math.max((Math.max(...lats)-south),(Math.max(...lngs)-west)*scale,1e-6)/Math.max(1,Math.sqrt(samples.length));
 const keyOf=(lat:number,lng:number)=>[Math.floor((lat-south)/size),Math.floor((lng-west)*scale/size)] as const;
 const buckets=new Map<string,typeof samples>();
 for(const s of samples){const [a,b]=keyOf(s.latitude,s.longitude);const k=a+','+b;(buckets.get(k)??buckets.set(k,[]).get(k)!).push(s);}
 const owned=new Map<string,string[]>(ids.map(id=>[id,[]]));
 for(const tile of tiles){
  const {latitude,longitude}=sampleOrigin(tile);const [a,b]=keyOf(latitude,longitude);
  let best:string|undefined;let bestDistance=Infinity;
  for(let ring=0;ring<=Math.sqrt(samples.length)+2;ring++){
   for(let i=a-ring;i<=a+ring;i++)for(let j=b-ring;j<=b+ring;j++){
    if(Math.max(Math.abs(i-a),Math.abs(j-b))!==ring)continue;
    for(const s of buckets.get(i+','+j)??[]){const d=(s.latitude-latitude)**2+((s.longitude-longitude)*scale)**2;if(d<bestDistance){bestDistance=d;best=s.id;}}
   }
   // Anything in a further ring is at least `ring` buckets away.
   if(best&&Math.sqrt(bestDistance)<=ring*size)break;
  }
  if(best&&bestDistance<=reach.get(best)!){owned.get(best)!.push(tile);cellFor.set(tile,best);}
 }
 const features=ids.filter(id=>owned.get(id)!.length).map(id=>{
  // Tiles are finer near the destination; merge each size separately (H3 needs one resolution per call).
  const bySize=new Map<number,string[]>();for(const tile of owned.get(id)!){const r=getResolution(tile);(bySize.get(r)??bySize.set(r,[]).get(r)!).push(tile);}
  // Every ring of every piece in one path; H3 winds holes the other way, so they stay empty.
  const coordinates=[...bySize.values()].flatMap(group=>cellsToMultiPolygon(group,true).flat());
  return {type:'Feature' as const,properties:{id,minutes:null},geometry:{type:'Polygon' as const,coordinates}};
 });
 return {...grid,features,cellFor};
}
export function displaySampleAt(display:{cellFor:Map<string,string>},point:{latitude:number;longitude:number}){
 const resolutions=new Set([...display.cellFor.keys()].map(getResolution));
 for(const r of [...resolutions].sort((a,b)=>b-a)){const id=display.cellFor.get(latLngToCell(point.latitude,point.longitude,r));if(id)return id;}
 return undefined;
}
