import {createHash} from 'node:crypto';
import {getPlacewiseClient} from '@/src/lib/supabase/server';
export class RequestBudgetError extends Error {constructor(message:string,public retryAfter=60){super(message);this.name='RoutingUnavailableError';}}
const buckets=new Map<string,{used:number;expires:number}>();
export function consumeLocalBudget(key:string,maximum:number,windowSeconds:number,now=Date.now()){
 const current=buckets.get(key);if(current&&current.expires>now){if(current.used>=maximum)return false;current.used++;return true;}
 for(const [id,row] of buckets)if(row.expires<=now)buckets.delete(id);
 if(buckets.size>=10000)return false;
 buckets.set(key,{used:1,expires:now+windowSeconds*1000});return true;
}
export async function consumeBudget(key:string,maximum:number,windowSeconds:number){
 if(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY){
  const {data,error}=await getPlacewiseClient().rpc('consume_request_budget',{bucket:key,maximum,window_seconds:windowSeconds});
  if(error)throw new RequestBudgetError('Request protection is temporarily unavailable. Please try again shortly.');
  return data===true;
 }
 if(process.env.NODE_ENV==='production')throw new RequestBudgetError('Request protection is not configured.');
 return consumeLocalBudget(key,maximum,windowSeconds);
}
export async function apiLimit(request:Request,kind:string,maximum:number){
 // Vercel supplies this header. Other hosts conservatively share one bucket;
 // arbitrary forwarded headers are not trusted to bypass the limit.
 const identity=process.env.VERCEL?request.headers.get('x-vercel-forwarded-for')??'unknown':'local';
 const key=createHash('sha256').update(identity).digest('hex');
 try{if(await consumeBudget('api:'+kind+':'+key,maximum,300))return null;
 return Response.json({error:'Too many requests. Please wait five minutes before retrying.'},{status:429,headers:{'Retry-After':'300'}});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'Request protection unavailable'},{status:503,headers:{'Retry-After':'60'}});}
}
export async function paidRequestBudget(){
 const configured=Number(process.env.GOOGLE_REQUESTS_PER_DAY??500);
 const maximum=Number.isSafeInteger(configured)&&configured>0?configured:500;
 const monthValue=Number(process.env.GOOGLE_REQUESTS_PER_MONTH??2000);
 const monthly=Number.isSafeInteger(monthValue)&&monthValue>0?monthValue:2000;
 if(!await consumeBudget('google-month:'+new Date().toISOString().slice(0,7),monthly,2678400))throw new RequestBudgetError('The monthly map request limit has been reached. Cached routes remain available.',86400);
 if(!await consumeBudget('google:'+new Date().toISOString().slice(0,10),maximum,86400))throw new RequestBudgetError('The daily map request limit has been reached. Please try again tomorrow.',86400);
}
