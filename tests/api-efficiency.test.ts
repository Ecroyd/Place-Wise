import {afterEach,describe,expect,it,vi} from 'vitest';
import {GoogleRoutesProvider,drivePreferences} from '../src/lib/routing/google';
import {SharedRoutingProvider,routeCacheKey} from '../src/lib/routing/shared';
import type {RoutingProvider} from '../src/lib/routing/provider';
const destination={latitude:53.48,longitude:-2.24};
const origins=Array.from({length:30},(_,i)=>({latitude:53.3+i*.01,longitude:-2.4}));
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();});
describe('Google API efficiency',()=>{
 it('uses typical traffic unless the user picked a departure time',()=>{
  expect(drivePreferences({transportMode:'drive'})).toEqual({routingPreference:'TRAFFIC_UNAWARE'});
  const later=new Date(Date.now()+3600000).toISOString();
  expect(drivePreferences({transportMode:'drive',departureTime:later})).toEqual({routingPreference:'TRAFFIC_AWARE',departureTime:later});
 });
 it('routes many origins with one matrix request per 25 origins',async()=>{
  const fetchMock=vi.fn(async(url:string,options:{body:string})=>{const body=JSON.parse(options.body);
   expect(url).toContain('computeRouteMatrix');expect(body.routingPreference).toBe('TRAFFIC_UNAWARE');
   return Response.json(body.origins.map((_:unknown,i:number)=>i===1?{originIndex:i,condition:'ROUTE_NOT_FOUND'}:{...(i?{originIndex:i}:{}),condition:'ROUTE_EXISTS',duration:`${600+i*60}s`,distanceMeters:5000}));});
  vi.stubGlobal('fetch',fetchMock);
  const results=await new GoogleRoutesProvider('test').getTravelTimes(origins,destination,{transportMode:'drive'});
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(results[0]).toMatchObject({status:'fulfilled',value:{minutes:10,distanceKm:5,selectedMode:'drive'}});
  expect(results[1]).toMatchObject({status:'rejected',reason:{name:'NoRouteError'}});
  expect(results[27]).toMatchObject({status:'fulfilled',value:{minutes:12}});
 });
 it('keeps walking, cycling and typical-traffic driving cached across time windows',()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-18T09:00:00Z'));
  const walk=routeCacheKey('Google',origins[0],destination,{transportMode:'walk'});
  const transit=routeCacheKey('Google',origins[0],destination,{transportMode:'transit'});
  vi.setSystemTime(new Date('2026-11-18T09:30:00Z'));
  expect(routeCacheKey('Google',origins[0],destination,{transportMode:'walk'})).toBe(walk);
  expect(routeCacheKey('Google',origins[0],destination,{transportMode:'transit'})).not.toBe(transit);
 });
 it('only sends uncached origins to the provider batch',async()=>{
  const batch=vi.fn(async(list:unknown[])=>list.map((_,i)=>({status:'fulfilled' as const,value:{minutes:i+1,source:'test'}})));
  const shared=new SharedRoutingProvider({getTravelTime:vi.fn(),getTravelTimes:batch} as unknown as RoutingProvider);
  const options={transportMode:'cycle' as const};
  await shared.getTravelTimes(origins.slice(0,3),{latitude:50,longitude:-1},options);
  await shared.getTravelTimes(origins.slice(0,5),{latitude:50,longitude:-1},options);
  expect(batch).toHaveBeenCalledTimes(2);expect(batch.mock.calls[1][0]).toHaveLength(2);
 });
});
