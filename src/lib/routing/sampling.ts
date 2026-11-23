import type {DestinationConstraint} from '@/src/types/domain';
import {cellToBoundary,cellToParent,getHexagonAreaAvg,getResolution,latLngToCell,UNITS} from 'h3-js';
import {distanceKm,sampleOrigin,type commuteGrid} from './commute';
export const OVERVIEW_ROUTE_BUDGET=96;
export const DETAIL_ROUTE_BUDGET=48;
export function sampleLimit(destinations:DestinationConstraint[],budget=OVERVIEW_ROUTE_BUDGET){
 const weight=destinations.reduce((sum,d)=>sum+(d.transportMode==='any'?5:d.transportMode==='transit'||d.transportMode==='mixed'?2:1),0);
 return Math.max(1,Math.floor(budget/Math.max(1,weight)));
}
// Keep small cells and actual routed centres; never colour untested gaps.
// Farthest-point selection spreads a bounded sample across the possible area.
export function overviewSamples(grid:ReturnType<typeof commuteGrid>,destinations:DestinationConstraint[],budget=OVERVIEW_ROUTE_BUDGET){
 const points=grid.features.map(feature=>({id:feature.properties.id,point:sampleOrigin(feature.properties.id),nearest:Infinity})).filter(({point})=>destinations.every(d=>d.maximumDistanceKm===undefined||distanceKm(point,d)<=d.maximumDistanceKm+1));
 const limit=sampleLimit(destinations,budget);if(points.length<=limit)return points.map(p=>p.id);
 const selected:string[]=[];let next=0;const scale=Math.cos(points[0].point.latitude*Math.PI/180);
 for(let i=0;i<limit;i++){const chosen=points[next];selected.push(chosen.id);chosen.nearest=-1;let greatest=-1;
  for(let j=0;j<points.length;j++){const item=points[j];if(item.nearest<0)continue;const delta=(item.point.latitude-chosen.point.latitude)**2+((item.point.longitude-chosen.point.longitude)*scale)**2;item.nearest=Math.min(item.nearest,delta);if(item.nearest>greatest){greatest=item.nearest;next=j;}}
 }
 return selected;
}

// Each overview sample stands for the area around it, so draw it as a hexagon sized
// to the spacing between samples instead of the tiny routed cell. Otherwise ~100
// checked points over a 100 km radius render as specks and the map looks empty.
// Properties keep the routed sample's id so colouring and clicks still use real times.
type Grid=ReturnType<typeof commuteGrid>;
export function overviewDisplayGrid(grid:Grid,ids:string[]):Grid&{cellFor:Map<string,string>}{
 const cellFor=new Map<string,string>();
 if(!ids.length||!grid.features.length)return {...grid,features:[],cellFor};
 const total=grid.features.reduce((sum,f)=>sum+getHexagonAreaAvg(getResolution(f.properties.id),UNITS.km2),0);
 const target=total/ids.length;
 // Finest resolution whose cells are still at least ~60% of the area each sample represents.
 let resolution=0;
 for(let r=0;r<=15;r++){if(getHexagonAreaAvg(r,UNITS.km2)>=target*0.6)resolution=r;else break;}
 const used=new Set<string>();
 const features=ids.map(id=>{
  const own=getResolution(id);let r=Math.min(resolution,own);let cell=cellToParent(id,r);
  while(used.has(cell)&&r<own)cell=cellToParent(id,++r);
  used.add(cell);cellFor.set(cell,id);
  return {type:'Feature' as const,properties:{id,minutes:null},geometry:{type:'Polygon' as const,coordinates:[cellToBoundary(cell,true)]}};
 });
 return {...grid,features,cellFor};
}
export function displaySampleAt(display:{cellFor:Map<string,string>},point:{latitude:number;longitude:number}){
 const resolutions=new Set([...display.cellFor.keys()].map(getResolution));
 for(const r of [...resolutions].sort((a,b)=>b-a)){const id=display.cellFor.get(latLngToCell(point.latitude,point.longitude,r));if(id)return id;}
 return undefined;
}
