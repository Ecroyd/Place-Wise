import {paidRequestBudget} from '@/src/lib/server/budget';
import type {NamedArea} from '@/src/lib/data/nearby';

// Free, open geocoding first: postcodes.io (ONS postcodes and Ordnance Survey place
// names) and OpenRouteService (OpenStreetMap). Google is only a last resort.
// Open results may be stored long-term; Google's only for 30 days.
export type Geocoded={label:string;latitude:number;longitude:number;source:'postcodes.io'|'openrouteservice'|'google'};
export const OPEN_GEOCODE_TTL_MS=180*86400000;
export const GOOGLE_GEOCODE_TTL_MS=30*86400000;

const POSTCODE=/^([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})$/i;
const OUTCODE=/^[A-Z]{1,2}\d[A-Z\d]?$/i;
// Bigger settlements win when several places share a name ("Middleton" → the town in Rochdale).
const PLACE_RANK:Record<string,number>={City:0,Town:1,'Suburban Area':2,Village:3,Hamlet:4,'Other Settlement':5};
const normalise=(text:string)=>text.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const timeout=()=>AbortSignal.timeout(12000);
const orsBase=()=>(process.env.ORS_GEOCODE_URL??'https://api.openrouteservice.org').replace(/\/$/,'');

async function json<T>(url:string,init?:RequestInit):Promise<T|null>{
 const response=await fetch(url,{...init,signal:timeout()});
 if(response.status===404)return null;
 if(!response.ok)throw new Error(`Lookup failed (${response.status})`);
 return await response.json() as T;
}

type Place={name_1:string;local_type:string;latitude:number;longitude:number;district_borough?:string|null;county_unitary?:string|null;region?:string|null};
export function bestPlace(places:Place[],name:string,qualifier?:string):Place|undefined{
 const wanted=normalise(name);const within=qualifier?normalise(qualifier):undefined;
 return places
  .filter(place=>normalise(place.name_1)===wanted&&place.local_type in PLACE_RANK)
  .filter(place=>!within||[place.district_borough,place.county_unitary,place.region].some(area=>area&&normalise(area).includes(within)))
  .sort((a,b)=>PLACE_RANK[a.local_type]-PLACE_RANK[b.local_type])[0];
}

async function fromPostcodes(address:string):Promise<Geocoded|null>{
 const compact=address.replace(/\s+/g,' ').trim();
 const postcode=compact.match(POSTCODE);
 if(postcode){
  const found=await json<{result:{postcode:string;latitude:number;longitude:number;admin_ward?:string;admin_district?:string}}>(`https://api.postcodes.io/postcodes/${encodeURIComponent((postcode[1]+postcode[2]).toUpperCase())}`);
  const r=found?.result;
  return r?{label:[r.postcode,r.admin_ward,r.admin_district].filter(Boolean).join(', '),latitude:r.latitude,longitude:r.longitude,source:'postcodes.io'}:null;
 }
 if(OUTCODE.test(compact)){
  const found=await json<{result:{outcode:string;latitude:number;longitude:number;admin_district?:string[]}}>(`https://api.postcodes.io/outcodes/${encodeURIComponent(compact.toUpperCase())}`);
  const r=found?.result;
  return r?{label:[r.outcode,r.admin_district?.[0]].filter(Boolean).join(', '),latitude:r.latitude,longitude:r.longitude,source:'postcodes.io'}:null;
 }
 const [name,...rest]=compact.split(',');
 const qualifier=rest.join(',').replace(/\b(uk|united kingdom|england|great britain)\b/gi,'').trim()||undefined;
 const found=await json<{result:Place[]|null}>(`https://api.postcodes.io/places?${new URLSearchParams({q:name.trim(),limit:'100'})}`);
 const place=bestPlace(found?.result??[],name,qualifier);
 if(!place)return null;
 const area=place.district_borough??place.county_unitary??place.region;
 // "Leeds, Leeds" reads oddly; only add the area when it differs from the place.
 return {label:[place.name_1,area&&normalise(area)!==normalise(place.name_1)?area:undefined].filter(Boolean).join(', '),latitude:place.latitude,longitude:place.longitude,source:'postcodes.io'};
}

async function fromOpenRouteService(address:string):Promise<Geocoded|null>{
 const key=process.env.ORS_API_KEY;if(!key)return null;
 const found=await json<{features?:{properties:{label?:string;name?:string;confidence?:number};geometry:{coordinates:[number,number]}}[]}>(
  `${orsBase()}/geocode/search?${new URLSearchParams({text:address,'boundary.country':'GB',size:'1'})}`,{headers:{Authorization:key}});
 const feature=found?.features?.[0];
 if(!feature||(feature.properties.confidence??1)<0.6)return null;
 const [longitude,latitude]=feature.geometry.coordinates;
 return {label:(feature.properties.label??feature.properties.name??address).replace(/, United Kingdom$/,''),latitude,longitude,source:'openrouteservice'};
}

async function fromGoogle(address:string):Promise<Geocoded|null>{
 const key=process.env.GOOGLE_MAPS_API_KEY;if(!key)return null;
 const url=new URL('https://maps.googleapis.com/maps/api/geocode/json');
 url.searchParams.set('address',address+', UK');url.searchParams.set('region','uk');url.searchParams.set('key',key);
 await paidRequestBudget('geocoding');
 const payload=await json<{status:string;results?:{formatted_address:string;geometry:{location:{lat:number;lng:number}}}[]}>(url.toString());
 const result=payload?.results?.[0];
 return payload?.status==='OK'&&result?{label:result.formatted_address,latitude:result.geometry.location.lat,longitude:result.geometry.location.lng,source:'google'}:null;
}

export async function forwardGeocode(address:string):Promise<Geocoded|null>{
 for(const lookup of [fromPostcodes,fromOpenRouteService]){
  try{const found=await lookup(address);if(found)return found;}catch{/* try the next source */}
 }
 return fromGoogle(address);
}

// Names the neighbourhood or town at a point, for "Areas near …".
export async function reverseGeocode(point:{latitude:number;longitude:number}):Promise<{area:NamedArea|null;source:Geocoded['source']}>{
 const key=process.env.ORS_API_KEY;
 if(key){
  try{
   const found=await json<{features?:{properties:{gid:string;name:string;label?:string};geometry:{coordinates:[number,number]}}[]}>(
    `${orsBase()}/geocode/reverse?${new URLSearchParams({'point.lat':String(point.latitude),'point.lon':String(point.longitude),layers:'neighbourhood,locality,localadmin',size:'1','boundary.country':'GB'})}`,{headers:{Authorization:key}});
   const feature=found?.features?.[0];
   if(!feature)return {area:null,source:'openrouteservice'};
   const [longitude,latitude]=feature.geometry.coordinates;
   return {area:{id:feature.properties.gid,name:feature.properties.name,address:(feature.properties.label??feature.properties.name).replace(/, United Kingdom$/,''),latitude,longitude},source:'openrouteservice'};
  }catch{/* fall back to Google */}
 }
 const apiKey=process.env.GOOGLE_MAPS_API_KEY;
 if(!apiKey)throw new Error('Area lookup is not configured');
 type Result={place_id:string;formatted_address:string;address_components:{long_name:string;types:string[]}[];geometry:{location:{lat:number;lng:number}}};
 const url=new URL('https://maps.googleapis.com/maps/api/geocode/json');
 url.searchParams.set('latlng',`${point.latitude},${point.longitude}`);url.searchParams.set('key',apiKey);
 url.searchParams.set('result_type','locality|postal_town|sublocality|neighborhood');
 await paidRequestBudget('geocoding');
 const payload=await json<{status:string;results?:Result[]}>(url.toString());
 if(!payload||(payload.status!=='OK'&&payload.status!=='ZERO_RESULTS'))throw new Error('Area lookup unavailable');
 const result=payload.results?.[0];
 const component=result?.address_components.find(c=>c.types.some(type=>['neighborhood','sublocality','locality','postal_town'].includes(type)));
 return {area:result&&component?{id:result.place_id,name:component.long_name,address:result.formatted_address,latitude:result.geometry.location.lat,longitude:result.geometry.location.lng}:null,source:'google'};
}
