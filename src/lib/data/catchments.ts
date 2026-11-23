import type { FeatureCollection, Polygon, MultiPolygon } from 'geojson';
import type { ViewBounds } from './layers';
export interface CatchmentProperties { id:string;urn:string;name:string;phase:string;category:string;council:string;sourceUrl:string }
export type CatchmentData = FeatureCollection<Polygon|MultiPolygon,CatchmentProperties> & {retrievedAt:string;coverage:string;sourceUrl:string;councils?:string[];tooWide?:boolean};
// Councils whose published boundaries are in src/data/catchments.json (kept in step by a test).
export const CATCHMENT_COUNCILS=['Stockport','Sheffield','Cheshire','Wiltshire','Hampshire','Northumberland','Nottingham','York','Lancashire','Bristol','East Sussex','Bracknell Forest','Highland','Aberdeen','Aberdeenshire','Dundee','Edinburgh','Glasgow','Perth & Kinross','North Lanarkshire','North Ayrshire','South Ayrshire','Stirling','Fife','Argyll & Bute','Angus'] as const;
export const catchmentCoverage=()=>CATCHMENT_COUNCILS.join(', ');
// Wider than this (about a city region) we send no outlines: thousands of boundaries would be
// several megabytes and unreadable anyway.
export const MAX_CATCHMENT_VIEW_DEGREES=0.9;
export function catchmentBounds(geometry:Polygon|MultiPolygon):ViewBounds {
  const points=geometry.type==='Polygon'?geometry.coordinates.flat():geometry.coordinates.flat(2);
  return points.reduce((b,p)=>({west:Math.min(b.west,p[0]),east:Math.max(b.east,p[0]),south:Math.min(b.south,p[1]),north:Math.max(b.north,p[1])}),{west:180,east:-180,south:90,north:-90});
}
export function catchmentsInView(data:CatchmentData,b:ViewBounds,phase='All',school='') {
  const tooWide=!school&&(b.east-b.west>MAX_CATCHMENT_VIEW_DEGREES*1.6||b.north-b.south>MAX_CATCHMENT_VIEW_DEGREES);
  if(tooWide)return {...data,features:[],tooWide:true};
  return {...data,tooWide:false,features:data.features.filter(f=>{
    if(school)return f.properties.urn===school;
    if(phase!=='All'&&f.properties.phase!==phase)return false;
    const box=catchmentBounds(f.geometry);
    return box.west<=b.east&&box.east>=b.west&&box.south<=b.north&&box.north>=b.south;
  })};
}
