import {z} from 'zod';
import {apiLimit} from '@/src/lib/server/budget';
import {areaSummary} from '@/src/lib/server/areaSummary';

const schema=z.object({name:z.string().trim().min(1).max(80),context:z.string().trim().max(120).default(''),lat:z.coerce.number().min(49).max(61),lng:z.coerce.number().min(-9).max(2.5)});

export async function GET(request:Request){
 const limited=await apiLimit(request,'area-summary',300);if(limited)return limited;
 const parsed=schema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
 if(!parsed.success)return Response.json({error:'Invalid area'},{status:400});
 const {name,context,lat,lng}=parsed.data;
 try{
  const summary=await areaSummary(name,context,{latitude:lat,longitude:lng});
  return Response.json({summary},{headers:{'Cache-Control':'public, s-maxage=604800, stale-while-revalidate=2592000'}});
 }catch{
  return Response.json({summary:null},{status:502});
 }
}
