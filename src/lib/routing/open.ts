import type {Coordinates} from '@/src/types/domain';
import type {RoutingOptions,RoutingProvider,TravelTimeResult} from './provider';
import {routeMany} from './batch';
import {fastest,NoRouteError,RoutingUnavailableError} from './google';

type Settled=PromiseSettledResult<TravelTimeResult>;
type BatchProvider=RoutingProvider&{getTravelTimes?:(origins:Coordinates[],destination:Coordinates,options:RoutingOptions)=>Promise<Settled[]>};
type OpenMode='drive'|'walk'|'cycle';
const PROFILE:Record<OpenMode,string>={drive:'driving-car',walk:'foot-walking',cycle:'cycling-regular'};
const LABEL:Record<OpenMode,string>={drive:'Drive',walk:'Walk',cycle:'Cycle'};
// OpenRouteService allows 3,500 matrix elements per call; stay well inside it.
const CHUNK=50;
const OPEN_ROUTE_TTL_DAYS=Number(process.env.OPEN_ROUTE_TTL_DAYS??90);
export const OPEN_ROUTE_TTL_MS=(Number.isFinite(OPEN_ROUTE_TTL_DAYS)&&OPEN_ROUTE_TTL_DAYS>0?OPEN_ROUTE_TTL_DAYS:90)*86400000;

class RequestRejected extends Error{constructor(message:string){super(message);this.name='RequestRejected';}}

// Driving (typical traffic), walking and cycling from OpenStreetMap via OpenRouteService.
// Results are open data (ODbL), so unlike Google's they may be stored and reused.
export class OpenRouteServiceProvider implements RoutingProvider{
 // HeiGIT retired api.openrouteservice.org on 2026-11-24; the same service now lives under
 // api.heigit.org/openrouteservice (a self-hosted server can be set with ORS_URL).
 constructor(private apiKey=process.env.ORS_API_KEY,private endpoint=(process.env.ORS_URL??'https://api.heigit.org/openrouteservice').replace(/\/$/,'')){}
 async getTravelTime(origin:Coordinates,destination:Coordinates,options:RoutingOptions){
  const [result]=await this.getTravelTimes([origin],destination,options);
  if(result.status==='rejected')throw result.reason;return result.value;
 }
 async getTravelTimes(origins:Coordinates[],destination:Coordinates,options:RoutingOptions):Promise<Settled[]>{
  const mode=options.transportMode as OpenMode;
  if(!(mode in PROFILE))return origins.map(()=>({status:'rejected',reason:new RoutingUnavailableError('Open routing covers driving, walking and cycling only')}));
  const results:Settled[]=[];
  for(let start=0;start<origins.length;start+=CHUNK)results.push(...await this.chunk(origins.slice(start,start+CHUNK),destination,mode));
  return results;
 }
 // A single unroutable point (sea, moorland) makes ORS reject the whole request,
 // so split rejected batches until the bad point is isolated.
 private async chunk(origins:Coordinates[],destination:Coordinates,mode:OpenMode):Promise<Settled[]>{
  try{return await this.matrix(origins,destination,mode);}
  catch(error){
   if(!(error instanceof RequestRejected))return origins.map(()=>({status:'rejected',reason:error}));
   if(origins.length===1)return [{status:'rejected',reason:new NoRouteError()}];
   const half=Math.ceil(origins.length/2);
   return [...await this.chunk(origins.slice(0,half),destination,mode),...await this.chunk(origins.slice(half),destination,mode)];
  }
 }
 private async matrix(origins:Coordinates[],destination:Coordinates,mode:OpenMode):Promise<Settled[]>{
  const locations=[...origins,destination].map(point=>[point.longitude,point.latitude]);
  const response=await fetch(`${this.endpoint}/v2/matrix/${PROFILE[mode]}`,{method:'POST',signal:AbortSignal.timeout(20000),
   headers:{'Content-Type':'application/json',Accept:'application/json',...(this.apiKey?{Authorization:this.apiKey}:{})},
   body:JSON.stringify({locations,sources:origins.map((_,i)=>i),destinations:[origins.length],metrics:['duration','distance'],units:'km'})});
  if(response.status===400||response.status===404)throw new RequestRejected(`Open routing rejected the request (${response.status})`);
  if(!response.ok)throw new RoutingUnavailableError(`Open routing unavailable (${response.status})`);
  const payload=await response.json() as {durations?:(number|null)[][];distances?:(number|null)[][]};
  return origins.map((_,i)=>{
   const seconds=payload.durations?.[i]?.[0];const km=payload.distances?.[i]?.[0];
   if(seconds==null||!Number.isFinite(seconds))return {status:'rejected',reason:new NoRouteError()};
   const minutes=Math.max(1,Math.ceil(seconds/60));
   return {status:'fulfilled',value:{minutes,distanceKm:km==null?undefined:Math.round(km*10)/10,source:'openrouteservice',selectedMode:mode,itinerary:[{mode:LABEL[mode],minutes}]}};
  });
 }
 async getTravelTimeMatrix(origins:Coordinates[],destinations:Coordinates[],options:RoutingOptions){return Promise.all(origins.map(origin=>Promise.all(destinations.map(destination=>this.getTravelTime(origin,destination,options)))));}
 async getIsochrone():Promise<Coordinates[]>{throw new Error('Isochrones are not used')}
}

// Google (paid) routing is only used when the person chose a departure time:
// public transport needs timetables, and a timed drive uses live traffic.
// Everything else uses open routing.
export function usesOpenRouting(options:RoutingOptions){
 if(options.transportMode==='walk'||options.transportMode==='cycle')return true;
 return options.transportMode==='drive'&&!options.departureTime;
}
const needsTime=()=>new RoutingUnavailableError('Choose a departure time to include public transport. Timetables depend on when you leave.');

export class HybridRoutingProvider implements RoutingProvider{
 constructor(private open:BatchProvider,private google:BatchProvider|null){}
 async getTravelTime(origin:Coordinates,destination:Coordinates,options:RoutingOptions){
  const [result]=await this.getTravelTimes([origin],destination,options);
  if(result.status==='rejected')throw result.reason;return result.value;
 }
 async getTravelTimes(origins:Coordinates[],destination:Coordinates,options:RoutingOptions):Promise<Settled[]>{
  if(options.transportMode==='any')return this.anyMode(origins,destination,options);
  if((options.transportMode==='transit'||options.transportMode==='mixed')&&!options.departureTime)return origins.map(()=>({status:'rejected',reason:needsTime()}));
  if(!usesOpenRouting(options))return this.viaGoogle(origins,destination,options);
  const routed=await routeMany(this.open,origins,destination,{...options,departureTime:undefined});
  // If the open router is down or over its limit, fall back to Google for those points.
  const retry=routed.flatMap((result,i)=>result.status==='rejected'&&!(result.reason instanceof NoRouteError)?[i]:[]);
  if(!retry.length||!this.google)return routed;
  const fallback=await routeMany(this.google,retry.map(i=>origins[i]),destination,{...options,departureTime:undefined});
  retry.forEach((index,i)=>{routed[index]=fallback[i];});
  return routed;
 }
 private viaGoogle(origins:Coordinates[],destination:Coordinates,options:RoutingOptions):Promise<Settled[]>{
  if(!this.google)return Promise.resolve(origins.map(()=>({status:'rejected',reason:new RoutingUnavailableError('Public transport routing is not configured')})));
  return routeMany(this.google,origins,destination,options);
 }
 // Open routing is free, so driving, walking and cycling are checked for every point.
 private async anyMode(origins:Coordinates[],destination:Coordinates,options:RoutingOptions):Promise<Settled[]>{
  const [drive,walk,cycle,transit]=await Promise.all([
   this.getTravelTimes(origins,destination,{...options,transportMode:'drive'}),
   this.getTravelTimes(origins,destination,{...options,transportMode:'walk'}),
   this.getTravelTimes(origins,destination,{...options,transportMode:'cycle'}),
   // Public transport only joins "any" when a departure time was chosen.
   this.google&&options.departureTime?this.viaGoogle(origins,destination,{...options,transportMode:'transit'}):Promise.resolve(null),
  ]);
  return origins.map((_,i)=>fastest([drive[i],walk[i],cycle[i],...(transit?[transit[i]]:[])]));
 }
 async getTravelTimeMatrix(origins:Coordinates[],destinations:Coordinates[],options:RoutingOptions){return Promise.all(origins.map(origin=>Promise.all(destinations.map(destination=>this.getTravelTime(origin,destination,options)))));}
 async getIsochrone():Promise<Coordinates[]>{throw new Error('Isochrones are not used')}
}
