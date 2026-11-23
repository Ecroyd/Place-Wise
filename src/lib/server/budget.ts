import {createHash} from 'node:crypto';
import {getPlacewiseClient} from '@/src/lib/supabase/server';
export class RequestBudgetError extends Error {constructor(message:string,public retryAfter=60){super(message);this.name='RoutingUnavailableError';}}
const buckets=new Map<string,{used:number;expires:number}>();
export function consumeLocalBudget(key:string,maximum:number,windowSeconds:number,now=Date.now(),amount=1){
 if(amount>maximum)return false;
 const current=buckets.get(key);if(current&&current.expires>now){if(current.used+amount>maximum)return false;current.used+=amount;return true;}
 for(const [id,row] of buckets)if(row.expires<=now)buckets.delete(id);
 if(buckets.size>=10000)return false;
 buckets.set(key,{used:amount,expires:now+windowSeconds*1000});return true;
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
// Google gives a free monthly allowance per SKU (not a pooled credit), so each SKU
// has its own monthly counter set just below its free cap. Route Matrix bills per
// element, so callers pass the element count and it is consumed atomically.
export type GoogleSku='geocoding'|'routes'|'routes-pro'|'matrix'|'matrix-pro';
export const GOOGLE_FREE_MONTHLY:Record<GoogleSku,number>={geocoding:10000,routes:10000,'routes-pro':5000,matrix:10000,'matrix-pro':5000};
const SKU_ENV:Record<GoogleSku,string>={geocoding:'GOOGLE_MONTHLY_LIMIT_GEOCODING',routes:'GOOGLE_MONTHLY_LIMIT_ROUTES','routes-pro':'GOOGLE_MONTHLY_LIMIT_ROUTES_PRO',matrix:'GOOGLE_MONTHLY_LIMIT_MATRIX','matrix-pro':'GOOGLE_MONTHLY_LIMIT_MATRIX_PRO'};
const SKU_LABEL:Record<GoogleSku,string>={geocoding:'place lookup',routes:'journey',"routes-pro":'traffic-aware journey',matrix:'travel-time map','matrix-pro':'traffic-aware travel-time map'};
function positiveInteger(value:string|undefined){const parsed=Number(value);return Number.isSafeInteger(parsed)&&parsed>0?parsed:undefined;}
export function googleMonthlyLimit(sku:GoogleSku,env:Record<string,string|undefined>=process.env){
 const explicit=positiveInteger(env[SKU_ENV[sku]]);if(explicit)return explicit;
 const shareValue=Number(env.GOOGLE_FREE_USAGE_SHARE??0.9);
 const share=Number.isFinite(shareValue)&&shareValue>0&&shareValue<=1?shareValue:0.9;
 return Math.floor(GOOGLE_FREE_MONTHLY[sku]*share);
}
const MONTH_WINDOW=32*86400;
export async function paidRequestBudget(sku:GoogleSku,count=1){
 const amount=Math.max(1,Math.ceil(count));const now=new Date().toISOString();
 if(!await consumeUnits('google-sku:'+sku+':'+now.slice(0,7),googleMonthlyLimit(sku),MONTH_WINDOW,amount))throw new RequestBudgetError(`The free monthly ${SKU_LABEL[sku]} allowance has been used. Cached results remain available.`,86400);
 const overall=positiveInteger(process.env.GOOGLE_REQUESTS_PER_MONTH);
 if(overall&&!await consumeUnits('google-month:'+now.slice(0,7),overall,MONTH_WINDOW,amount))throw new RequestBudgetError('The monthly map request limit has been reached. Cached routes remain available.',86400);
 const daily=positiveInteger(process.env.GOOGLE_REQUESTS_PER_DAY)??500;
 if(!await consumeUnits('google:'+now.slice(0,10),daily,86400,amount))throw new RequestBudgetError('The daily map request limit has been reached. Please try again tomorrow.',86400);
}
export async function consumeUnits(key:string,maximum:number,windowSeconds:number,amount:number){
 if(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY){
  const {data,error}=await getPlacewiseClient().rpc('consume_request_units',{bucket:key,maximum,window_seconds:windowSeconds,amount});
  if(error)throw new RequestBudgetError('Request protection is temporarily unavailable. Please try again shortly.');
  return data===true;
 }
 if(process.env.NODE_ENV==='production')throw new RequestBudgetError('Request protection is not configured.');
 return consumeLocalBudget(key,maximum,windowSeconds,Date.now(),amount);
}
