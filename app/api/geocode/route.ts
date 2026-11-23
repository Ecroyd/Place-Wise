import {withPayer} from '@/src/lib/server/payer';
import {apiLimit} from '@/src/lib/server/budget';
import {forwardGeocode,GOOGLE_GEOCODE_TTL_MS,OPEN_GEOCODE_TTL_MS} from '@/src/lib/server/geocoding';
import {readCached,writeCached} from '@/src/lib/server/responseCache';
import {z} from "zod";
const requestSchema=z.object({address:z.string().trim().min(2).max(200)});
type Geocoded={label:string;latitude:number;longitude:number};
const memory=new Map<string,{value:Geocoded;expires:number}>();
const geocodeCacheKey=(address:string)=>'geocode:v2:'+address.toLowerCase().replace(/\s+/g,' ').trim();
async function handlePost(request:Request){
 const limited=await apiLimit(request,"geocode",60);if(limited)return limited;
 const parsed=requestSchema.safeParse(await request.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:"Enter a valid destination"},{status:400});
 const cacheKey=geocodeCacheKey(parsed.data.address);
 const remembered=memory.get(cacheKey);if(remembered&&remembered.expires>Date.now())return Response.json(remembered.value);
 const stored=(await readCached<Geocoded>([cacheKey]).catch(()=>new Map())).get(cacheKey);
 if(stored){memory.set(cacheKey,{value:stored.payload,expires:stored.expires});return Response.json(stored.payload);}
 try {
  const found=await forwardGeocode(parsed.data.address);
  if(!found)return Response.json({error:"Destination not found. Try a town, postcode or full address."},{status:404});
  const value={label:found.label,latitude:found.latitude,longitude:found.longitude};
  const expires=Date.now()+(found.source==='google'?GOOGLE_GEOCODE_TTL_MS:OPEN_GEOCODE_TTL_MS);
  if(memory.size>=1000)memory.delete(memory.keys().next().value!);
  memory.set(cacheKey,{value,expires});await writeCached([{key:cacheKey,payload:value,expires}]).catch(()=>undefined);
  return Response.json(value);
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Place lookup unavailable'},{status:503,headers:{'Retry-After':'60'}});}
}

// Google calls made while handling this request are paid from the signed-in user's credit once the free allowance is used.
export async function POST(request: Request) { return withPayer(request, () => handlePost(request)); }
