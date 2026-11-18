import {createHash} from 'node:crypto';
import {readCached,writeCached} from '@/src/lib/server/responseCache';
import type {Coordinates} from '@/src/types/domain';
import type {RoutingProvider,RoutingOptions,TravelTimeResult} from './provider';
import {routeMany} from './batch';
type Entry={value:TravelTimeResult;expires:number};
type Settled=PromiseSettledResult<TravelTimeResult>;
const memory=new Map<string,Entry>();const pending=new Map<string,Promise<TravelTimeResult>>();
const NEAR_NOW_MS=300000;
// Walking, cycling and typical-traffic driving do not depend on the time of day.
export const TIME_INDEPENDENT_TTL_MS=24*3600000;
export function isTimeIndependent(options:RoutingOptions){
 return options.transportMode==='walk'||options.transportMode==='cycle'||(options.transportMode==='drive'&&!options.departureTime);
}
export function routeCacheKey(provider:string,origin:Coordinates,destination:Coordinates,options:RoutingOptions){
 const departure=options.departureTime;
 // Keep scheduled departures exact. Near-now departures share a five-minute window.
 const time=isTimeIndependent(options)?'static':departure&&Math.abs(Date.parse(departure)-Date.now())>NEAR_NOW_MS?departure:Math.floor(Date.now()/NEAR_NOW_MS);
 return createHash('sha256').update(JSON.stringify(['v2',provider,origin.latitude,origin.longitude,destination.latitude,destination.longitude,options.transportMode,time,options.timeProfile])).digest('hex');
}
const ttl=(options:RoutingOptions)=>isTimeIndependent(options)?TIME_INDEPENDENT_TTL_MS:NEAR_NOW_MS;
function remember(key:string,entry:Entry){if(memory.size>=5000)memory.delete(memory.keys().next().value!);memory.set(key,entry);}
export class SharedRoutingProvider implements RoutingProvider{
 constructor(private provider:RoutingProvider){}
 async getTravelTime(origin:Coordinates,destination:Coordinates,options:RoutingOptions):Promise<TravelTimeResult>{
  const [result]=await this.getTravelTimes([origin],destination,options);
  if(result.status==='rejected')throw result.reason;return result.value;
 }
 // Serve each origin from memory, in-flight lookups or Supabase; route only the
 // remainder in one batch so the provider can use a single matrix request.
 async getTravelTimes(origins:Coordinates[],destination:Coordinates,options:RoutingOptions):Promise<Settled[]>{
  const keys=origins.map(origin=>routeCacheKey(this.provider.constructor.name,origin,destination,options));
  const results=new Map<string,Promise<TravelTimeResult>>();const missing:{key:string;origin:Coordinates}[]=[];
  keys.forEach((key,i)=>{
   if(results.has(key))return;
   const cached=memory.get(key);if(cached&&cached.expires>Date.now()){results.set(key,Promise.resolve(cached.value));return;}
   const existing=pending.get(key);if(existing){results.set(key,existing);return;}
   missing.push({key,origin:origins[i]});
  });
  if(missing.length){
   const batch=this.load(missing,destination,options);
   for(const {key} of missing){
    const promise=batch.then(found=>{const result=found.get(key)!;if(result.status==='rejected')throw result.reason;return result.value;});
    pending.set(key,promise);results.set(key,promise);
    promise.then(()=>pending.delete(key),()=>pending.delete(key));
   }
  }
  return Promise.allSettled(keys.map(key=>results.get(key)!));
 }
 private async load(missing:{key:string;origin:Coordinates}[],destination:Coordinates,options:RoutingOptions){
  const found=new Map<string,Settled>();
  const stored=await readCached<TravelTimeResult>(missing.map(item=>item.key)).catch(()=>new Map());
  for(const [key,entry] of stored){remember(key,{value:entry.payload,expires:entry.expires});found.set(key,{status:'fulfilled',value:entry.payload});}
  const remaining=missing.filter(item=>!found.has(item.key));
  const routed=await routeMany(this.provider,remaining.map(item=>item.origin),destination,options);
  const expires=Date.now()+ttl(options);const fresh:{key:string;payload:TravelTimeResult;expires:number}[]=[];
  remaining.forEach((item,i)=>{const result=routed[i];found.set(item.key,result);if(result.status==='fulfilled'){remember(item.key,{value:result.value,expires});fresh.push({key:item.key,payload:result.value,expires});}});
  await writeCached(fresh).catch(()=>undefined);
  return found;
 }
 async getTravelTimeMatrix(origins:Coordinates[],destinations:Coordinates[],options:RoutingOptions){return Promise.all(origins.map(origin=>Promise.all(destinations.map(destination=>this.getTravelTime(origin,destination,options)))));}
 getIsochrone(origin:Coordinates,minutes:number,options:RoutingOptions){return this.provider.getIsochrone(origin,minutes,options);}
}
