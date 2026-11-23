import {apiLimit,paidRequestBudget} from '@/src/lib/server/budget';
import {readCached,writeCached} from '@/src/lib/server/responseCache';
import {z} from "zod";
const requestSchema=z.object({address:z.string().trim().min(2).max(200)});
type Geocoded={label:string;latitude:number;longitude:number};
// Google permits caching geocoded coordinates for up to 30 days.
const GEOCODE_TTL_MS=30*86400000;
const memory=new Map<string,{value:Geocoded;expires:number}>();
const geocodeCacheKey=(address:string)=>'geocode:v1:'+address.toLowerCase().replace(/\s+/g,' ').trim();
export async function POST(request:Request){
 const limited=await apiLimit(request,"geocode",60);if(limited)return limited;
 const parsed=requestSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:"Enter a valid destination"},{status:400});
 const cacheKey=geocodeCacheKey(parsed.data.address);
 const remembered=memory.get(cacheKey);if(remembered&&remembered.expires>Date.now())return Response.json(remembered.value);
 const stored=(await readCached<Geocoded>([cacheKey]).catch(()=>new Map())).get(cacheKey);
 if(stored){memory.set(cacheKey,{value:stored.payload,expires:stored.expires});return Response.json(stored.payload);}
 const key=process.env.GOOGLE_MAPS_API_KEY;
 if(!key)return Response.json({error:"Google Geocoding is not configured"},{status:503});
 const url=new URL("https://maps.googleapis.com/maps/api/geocode/json");
 url.searchParams.set("address",parsed.data.address+", UK");url.searchParams.set("region","uk");url.searchParams.set("key",key);
 try {
 await paidRequestBudget('geocoding');
 const response=await fetch(url,{signal:AbortSignal.timeout(15000)});const payload=await response.json() as {status:string;error_message?:string;results?:{formatted_address:string;geometry:{location:{lat:number;lng:number}}}[]};
 const result=payload.results?.[0];
 if(payload.status!=="OK"||!result)return Response.json({error:payload.error_message??"Destination not found"},{status:404});
 const value={label:result.formatted_address,latitude:result.geometry.location.lat,longitude:result.geometry.location.lng};
 const expires=Date.now()+GEOCODE_TTL_MS;
 if(memory.size>=1000)memory.delete(memory.keys().next().value!);
 memory.set(cacheKey,{value,expires});await writeCached([{key:cacheKey,payload:value,expires}]).catch(()=>undefined);
 return Response.json(value);
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Geocoding unavailable'},{status:503,headers:{'Retry-After':'60'}});}
}
