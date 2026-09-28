import {describe,expect,it,vi} from 'vitest';
import {commuteGrid,sharedCommuteGrid,sampleOrigin,distanceKm} from '../src/lib/routing/commute';
import type {DestinationConstraint} from '../src/types/domain';
const {route}=vi.hoisted(()=>({route:vi.fn()}));
vi.mock('../src/lib/routing/provider',()=>({getLiveRoutingProvider:()=>({getTravelTime:route})}));
import {POST} from '../app/api/commute/route';
const first:DestinationConstraint={id:'first',label:'First',purpose:'Work',latitude:51.5,longitude:-0.15,transportMode:'walk',journeysPerWeek:5,minimumMinutes:0,maximumMinutes:60,maximumDistanceKm:40,weight:100,hardMaximum:true};
const second={...first,id:'second',label:'Second',transportMode:'cycle' as const,maximumMinutes:30};
const request=()=>new Request('http://localhost/api/commute',{method:'POST',body:JSON.stringify({destination:first,destinations:[first,second],cells:[commuteGrid(first).features[0].properties.id]})});
describe('commute intersection',()=>{
 it('hides a sample that exceeds one destination limit',async()=>{route.mockReset().mockResolvedValueOnce({minutes:20,distanceKm:3}).mockResolvedValueOnce({minutes:31,distanceKm:3});const data=await (await POST(request())).json();expect(data.samples[0].minutes).toBeNull();});
 it('uses the highest share of each individual limit and preserves the journeys',async()=>{route.mockReset().mockResolvedValueOnce({minutes:30,distanceKm:3}).mockResolvedValueOnce({minutes:24,distanceKm:3});const data=await (await POST(request())).json();expect(data.samples[0].minutes).toBe(80);expect(data.samples[0].itinerary).toEqual([{mode:'First',minutes:30},{mode:'Second',minutes:24}]);expect(route.mock.calls[1][2].transportMode).toBe('cycle');});
});

const cardiff={...first,latitude:51.4816,longitude:-3.1791,transportMode:'drive' as const,minimumMinutes:10,maximumMinutes:60};
const swansea={...cardiff,id:'swansea',label:'Swansea',latitude:51.6214,longitude:-3.9436,minimumMinutes:0,maximumMinutes:45};
describe('shared search coverage',()=>{
 it('checks the Cardiff–Swansea intersection first instead of thousands of Cardiff-only points',()=>{
  const original=commuteGrid(cardiff);const grid=sharedCommuteGrid([cardiff,swansea]);
  expect(grid.features.length).toBeGreaterThan(0);
  expect(grid.features.length).toBeLessThan(original.features.length/4);
  const bridgend={latitude:51.507,longitude:-3.578};
  expect(grid.features.slice(0,16).some(f=>distanceKm(sampleOrigin(f.properties.id),bridgend)<7)).toBe(true);
  for(const f of grid.features){const origin=sampleOrigin(f.properties.id);expect(distanceKm(origin,cardiff)).toBeLessThanOrEqual(41);expect(distanceKm(origin,swansea)).toBeLessThanOrEqual(41);}
 });
 it('includes the third destination and handles impossible intersections',()=>{
  const far={...cardiff,id:'far',latitude:55.953,longitude:-3.188};
  expect(sharedCommuteGrid([cardiff,swansea,far]).features).toEqual([]);
 });
 it('accepts cells from the tighter second destination sampling grid',async()=>{
  route.mockReset().mockResolvedValue({minutes:25,distanceKm:30});
  const cell=sharedCommuteGrid([cardiff,swansea]).features[0].properties.id;
  const response=await POST(new Request('http://localhost/api/commute',{method:'POST',body:JSON.stringify({destination:cardiff,destinations:[cardiff,swansea],cells:[cell]})}));
  expect(response.status).toBe(200);expect((await response.json()).samples[0].minutes).toBe(56);
 });
 it('distinguishes routing failure from a checked point outside the limits',async()=>{
  route.mockReset().mockRejectedValue(new Error('No route'));
  expect((await (await POST(request())).json()).samples[0].outcome).toBe('unavailable');
  route.mockReset().mockResolvedValue({minutes:90,distanceKm:3});
  expect((await (await POST(request())).json()).samples[0].outcome).toBe('outside');
 });
});
