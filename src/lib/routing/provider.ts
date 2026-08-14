import type { Coordinates, TransportMode } from "@/src/types/domain";
export interface RoutingOptions { transportMode:TransportMode; timeProfile?:string }
export interface TravelTimeResult { minutes:number; source:string }
export interface RoutingProvider { getTravelTime(origin:Coordinates,destination:Coordinates,options:RoutingOptions):Promise<TravelTimeResult>; getTravelTimeMatrix(origins:Coordinates[],destinations:Coordinates[],options:RoutingOptions):Promise<TravelTimeResult[][]>; getIsochrone(origin:Coordinates,minutes:number,options:RoutingOptions):Promise<Coordinates[]> }
const distance=(a:Coordinates,b:Coordinates)=>{const y=(b.latitude-a.latitude)*111;const x=(b.longitude-a.longitude)*111*Math.cos(a.latitude*Math.PI/180);return Math.sqrt(x*x+y*y)};
export class MockRoutingProvider implements RoutingProvider {
 async getTravelTime(a:Coordinates,b:Coordinates,o:RoutingOptions){const multipliers={drive:1.55,transit:2.4,walk:12,cycle:4,mixed:2.1};const jitter=Math.abs(Math.sin((a.latitude+b.longitude)*1000))*6;return {minutes:Math.round(distance(a,b)*multipliers[o.transportMode]+jitter+5),source:"mock-v1"};}
 async getTravelTimeMatrix(a:Coordinates[],b:Coordinates[],o:RoutingOptions){return Promise.all(a.map(x=>Promise.all(b.map(y=>this.getTravelTime(x,y,o)))))}
 async getIsochrone(a:Coordinates,m:number){return Array.from({length:12},(_,i)=>({latitude:a.latitude+Math.sin(i/12*Math.PI*2)*m/700,longitude:a.longitude+Math.cos(i/12*Math.PI*2)*m/450}));}
}
export class ValhallaRoutingProvider implements RoutingProvider {
 constructor(private endpoint:string){}
 async getTravelTime(origin:Coordinates,destination:Coordinates,options:RoutingOptions):Promise<TravelTimeResult>{void origin;void destination;void options;throw new Error(`Valhalla adapter not configured: ${this.endpoint}`)}
 async getTravelTimeMatrix(origins:Coordinates[],destinations:Coordinates[],options:RoutingOptions):Promise<TravelTimeResult[][]>{void origins;void destinations;void options;throw new Error("Valhalla adapter not configured")}
 async getIsochrone(origin:Coordinates,minutes:number,options:RoutingOptions):Promise<Coordinates[]>{void origin;void minutes;void options;throw new Error("Valhalla adapter not configured")}
}
