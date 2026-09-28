import type {DestinationConstraint} from '@/src/types/domain';
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
