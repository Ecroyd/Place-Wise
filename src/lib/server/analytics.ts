import {createHash} from 'node:crypto';
import {getPlacewiseClient} from '@/src/lib/supabase/server';

// Cookie-free analytics. A "visitor" is a hash of (secret salt, London date, IP, browser),
// so the same person counts once per day and can't be followed from one day to the next.
// No IP address, user id or cookie is stored.
export type SiteEventKind='visit'|'search'|'signup'|'topup';
const configured=()=>!!(process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY);
const BOT=/bot|crawl|spider|slurp|preview|monitor|headless|lighthouse|curl|wget|python|node-fetch|axios/i;
const londonDay=()=>new Date().toLocaleDateString('en-CA',{timeZone:'Europe/London'});

export function visitorHash(request:Request,day=londonDay()){
 const ip=request.headers.get('x-vercel-forwarded-for')??request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()??'';
 const agent=request.headers.get('user-agent')??'';
 const salt=process.env.ANALYTICS_SALT??process.env.SUPABASE_SECRET_KEY??'commutemap';
 return createHash('sha256').update(`${salt}|${day}|${ip}|${agent}`).digest('hex').slice(0,20);
}
export const isBot=(request:Request)=>BOT.test(request.headers.get('user-agent')??'');
const device=(request:Request)=>/mobile|iphone|android(?!.*tablet)/i.test(request.headers.get('user-agent')??'')?'mobile':'desktop';

export async function recordEvent(kind:SiteEventKind,options:{request?:Request;path?:string;detail?:string}={}){
 if(!configured())return;
 const {request,path,detail}=options;
 if(request&&isBot(request))return;
 try{
  const client=getPlacewiseClient();
  await client.from('site_events').insert({kind,visitor:request?visitorHash(request):null,device:request?device(request):null,
   path:path?.slice(0,120)??null,detail:detail?.trim().slice(0,80)||null});
  // Keep a year of events; prune now and then rather than on every write.
  if(Math.random()<0.002)await client.rpc('prune_site_events');
 }catch{/* analytics must never break the page */}
}

export async function isSiteAdmin(userId:string){
 if(!configured())return false;
 const {data,error}=await getPlacewiseClient().from('site_admins').select('user_id').eq('user_id',userId).maybeSingle();
 return !error&&!!data;
}
