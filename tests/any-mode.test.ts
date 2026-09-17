import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleRoutesProvider } from "../src/lib/routing/google";
import { destinationSchema } from "../src/schemas/criteria";
const origin = { latitude:53.3, longitude:-2.4 }, destination = { latitude:53.55, longitude:-2.2 };
afterEach(()=>vi.unstubAllGlobals());
describe("any travel mode",()=>{
 it("compares four modes and returns the fastest with the correct mode",async()=>{
  const durations:Record<string,number>={DRIVE:1200,TRANSIT:1800,BICYCLE:900,WALK:3600};
  const fetchMock=vi.fn(async (_url, options)=>Response.json({routes:[{duration:`${durations[JSON.parse(options.body).travelMode]}s`}]}));
  vi.stubGlobal("fetch",fetchMock);
  const result=await new GoogleRoutesProvider("test").getTravelTime(origin,destination,{transportMode:"any"});
  expect(result.minutes).toBe(15);expect(result.selectedMode).toBe("cycle");expect(result.itinerary?.[0].mode).toBe("Cycle");
  expect(new Set(fetchMock.mock.calls.map(call=>JSON.parse(call[1].body).travelMode))).toEqual(new Set(["DRIVE","TRANSIT","BICYCLE","WALK"]));
 });
 it("still returns an available journey when another mode has no route",async()=>{
  vi.stubGlobal("fetch",vi.fn(async (_url,options)=>Response.json(JSON.parse(options.body).travelMode==="DRIVE"?{routes:[{duration:"600s"}]}:{routes:[]})));
  const result=await new GoogleRoutesProvider("test").getTravelTime(origin,destination,{transportMode:"any"});
  expect(result.selectedMode).toBe("drive");expect(result.minutes).toBe(10);
 });
 it("does not invent a time when all modes have no route",async()=>{
  vi.stubGlobal("fetch",vi.fn(async()=>Response.json({routes:[]})));
  await expect(new GoogleRoutesProvider("test").getTravelTime(origin,destination,{transportMode:"any"})).rejects.toMatchObject({name:"NoRouteError"});
 });
 it("accepts any travel mode in search criteria",()=>{
  expect(destinationSchema.safeParse({...destination,id:"work",label:"Work",purpose:"work",transportMode:"any",journeysPerWeek:5,weight:100,hardMaximum:false}).success).toBe(true);
 });
});
