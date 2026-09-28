import {createHash} from 'node:crypto';
import {getPlacewiseClient} from '@/src/lib/supabase/server';
import type {Coordinates} from '@/src/types/domain';
import type {RoutingProvider,RoutingOptions,TravelTimeResult} from './provider';
type Entry={value:TravelTimeResult;expires:number};
const memory=new Map<string,Entry>();const pending=new Map<string,Promise<TravelTimeResult>>();
export function routeCacheKey(provider:string,origin:Coordinates,destination:Coordinates,options:RoutingOptions){
 const departure=options.departureTime;
 // Keep scheduled departures exact. Near-now departures share a five-minute window.
 const time=departure&&Math.abs(Date.parse(departure)-Date.now())>300000?departure:Math.floor(Date.now()/300000);
 return createHash('sha256').update(JSON.stringify(['v1',provider,origin.latitude,origin.longitude,destination.latitude,destination.longitude,options.transportMode,time,options.timeProfile])).digest('hex');
}
export class SharedRoutingProvider implements RoutingProvider{
 constructor(private provider:RoutingProvider){}
 async getTravelTime(origin:Coordinates,destination:Coordinates,options:RoutingOptions):Promise<TravelTimeResult>{
  const key=routeCacheKey(this.provider.constructor.name,origin,destination,options);const cached=memory.get(key);
  if(cached&&cached.expires>Date.now())return cached.value;
  const existing=pending.get(key);if(existing)return existing;
  const load=async()=>{
   const client=process.env.NEXT_PUBLIC_SUPABASE_URL&&process.env.SUPABASE_SECRET_KEY?getPlacewiseClient():undefined;
   if(client){const {data}=await client.from('route_response_cache').select('payload,expires_at').eq('key',key).gt('expires_at',new Date().toISOString()).maybeSingle();if(data){const entry={value:data.payload as TravelTimeResult,expires:Date.parse(data.expires_at)};remember(entry);return entry.value;}}
   const value=await this.provider.getTravelTime(origin,destination,options);
   const entry={value,expires:Date.now()+300000};remember(entry);
   if(client){await client.from('route_response_cache').upsert({key,payload:value,expires_at:new Date(entry.expires).toISOString()});}
   return value;
  };
  function remember(entry:Entry){if(memory.size>=5000)memory.delete(memory.keys().next().value!);memory.set(key,entry);}
  const promise=load();pending.set(key,promise);try{return await promise;}finally{pending.delete(key);}
 }
 async getTravelTimeMatrix(origins:Coordinates[],destinations:Coordinates[],options:RoutingOptions){return Promise.all(origins.map(origin=>Promise.all(destinations.map(destination=>this.getTravelTime(origin,destination,options)))));}
 getIsochrone(origin:Coordinates,minutes:number,options:RoutingOptions){return this.provider.getIsochrone(origin,minutes,options);}
}
