import { GoogleRoutesProvider } from "./google";
export { GoogleRoutesProvider } from "./google";
import type { Coordinates, TransportMode, JourneyStep } from "@/src/types/domain";
export interface RoutingOptions { transportMode:TransportMode; timeProfile?:string; departureTime?:string }
export interface TravelTimeResult { minutes:number; distanceKm?:number; source:string; itinerary?:JourneyStep[]; departureTime?:string; selectedMode?:TransportMode }
export interface RoutingProvider { getTravelTime(origin:Coordinates,destination:Coordinates,options:RoutingOptions):Promise<TravelTimeResult>; getTravelTimeMatrix(origins:Coordinates[],destinations:Coordinates[],options:RoutingOptions):Promise<TravelTimeResult[][]>; getIsochrone(origin:Coordinates,minutes:number,options:RoutingOptions):Promise<Coordinates[]> }
const distance=(a:Coordinates,b:Coordinates)=>{const y=(b.latitude-a.latitude)*111;const x=(b.longitude-a.longitude)*111*Math.cos(a.latitude*Math.PI/180);return Math.sqrt(x*x+y*y)};
export class MockRoutingProvider implements RoutingProvider {
 async getTravelTime(a:Coordinates,b:Coordinates,o:RoutingOptions){const multipliers={drive:1.55,transit:2.4,walk:12,cycle:4,mixed:2.1,any:1.55};const jitter=Math.abs(Math.sin((a.latitude+b.longitude)*1000))*6;return {minutes:Math.round(distance(a,b)*multipliers[o.transportMode]+jitter+5),source:"mock-v1"};}
 async getTravelTimeMatrix(a:Coordinates[],b:Coordinates[],o:RoutingOptions){return Promise.all(a.map(x=>Promise.all(b.map(y=>this.getTravelTime(x,y,o)))))}
 async getIsochrone(a:Coordinates,m:number){return Array.from({length:12},(_,i)=>({latitude:a.latitude+Math.sin(i/12*Math.PI*2)*m/700,longitude:a.longitude+Math.cos(i/12*Math.PI*2)*m/450}));}
}
export class OsrmRoutingProvider implements RoutingProvider {
 constructor(private endpoint="https://router.project-osrm.org"){}
 async getTravelTime(origin:Coordinates,destination:Coordinates,options:RoutingOptions):Promise<TravelTimeResult>{
  if(options.transportMode!=="drive")throw new Error("Live walking, cycling and transit routing are not enabled yet");
  const coordinates=`${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
  const response=await fetch(`${this.endpoint}/route/v1/driving/${coordinates}?overview=false&steps=false`,{headers:{"User-Agent":"Placewise/0.1"}});
  if(!response.ok)throw new Error("Live road routing failed ("+response.status+")");
  const payload=await response.json() as {code:string;routes?:{duration:number;distance:number}[];message?:string};
  if(payload.code!=="Ok"||!payload.routes?.[0])throw new Error(payload.message??"No road route was found");
  return {minutes:Math.max(1,Math.round(payload.routes[0].duration/60)),distanceKm:Math.round(payload.routes[0].distance/100)/10,source:"osrm-live"};
 }
 async getTravelTimeMatrix(origins:Coordinates[],destinations:Coordinates[],options:RoutingOptions){return Promise.all(origins.map(origin=>Promise.all(destinations.map(destination=>this.getTravelTime(origin,destination,options)))))}
 async getIsochrone():Promise<Coordinates[]>{throw new Error("OSRM does not provide isochrones")}
}
export function getLiveRoutingProvider(mode?:TransportMode):RoutingProvider {
 const key=process.env.GOOGLE_MAPS_API_KEY;
 if(mode && mode!=="drive" && (process.env.ROUTING_PROVIDER==="osrm" || !key?.startsWith("AIza"))) throw new Error("Public transport, walking and cycling require Google routing; driving routes cannot be substituted.");
 return process.env.ROUTING_PROVIDER!=="osrm"&&key?.startsWith("AIza")?new GoogleRoutesProvider(key):new OsrmRoutingProvider();
}
export class ValhallaRoutingProvider implements RoutingProvider {
 constructor(private endpoint:string){}
 async getTravelTime(origin:Coordinates,destination:Coordinates,options:RoutingOptions):Promise<TravelTimeResult>{void origin;void destination;void options;throw new Error(`Valhalla adapter not configured: ${this.endpoint}`)}
 async getTravelTimeMatrix(origins:Coordinates[],destinations:Coordinates[],options:RoutingOptions):Promise<TravelTimeResult[][]>{void origins;void destinations;void options;throw new Error("Valhalla adapter not configured")}
 async getIsochrone(origin:Coordinates,minutes:number,options:RoutingOptions):Promise<Coordinates[]>{void origin;void minutes;void options;throw new Error("Valhalla adapter not configured")}
}
