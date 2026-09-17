import {describe,expect,it,vi} from 'vitest';
import {commuteGrid} from '../src/lib/routing/commute';
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
