import {describe,it,expect,vi,afterEach} from 'vitest';
import {consumeLocalBudget} from '../src/lib/server/budget';
import {SharedRoutingProvider,routeCacheKey} from '../src/lib/routing/shared';
import type {RoutingProvider} from '../src/lib/routing/provider';
import {restoreCriteria} from '../src/lib/account/searches';
import {defaultView} from '../src/lib/account/view';
afterEach(()=>vi.useRealTimers());
describe('routing cost controls',()=>{
 it('rejects exhausted windows and allows requests after expiry',()=>{expect(consumeLocalBudget('expiry',2,60,1000)).toBe(true);expect(consumeLocalBudget('expiry',2,60,1001)).toBe(true);expect(consumeLocalBudget('expiry',2,60,1002)).toBe(false);expect(consumeLocalBudget('expiry',2,60,61001)).toBe(true);});
 it('deduplicates in-flight and repeated journeys without caching failures',async()=>{
  const route=vi.fn().mockResolvedValue({minutes:20,distanceKm:10,source:'test'});
  const provider=new SharedRoutingProvider({getTravelTime:route} as unknown as RoutingProvider);
  const origin={latitude:52.222,longitude:-1.234},destination={latitude:53.4,longitude:-2.1},options={transportMode:'drive' as const};
  await Promise.all([provider.getTravelTime(origin,destination,options),provider.getTravelTime(origin,destination,options)]);expect(route).toHaveBeenCalledTimes(1);
  await provider.getTravelTime(origin,destination,options);expect(route).toHaveBeenCalledTimes(1);
  route.mockRejectedValueOnce(Error('temporary'));await expect(provider.getTravelTime(origin,destination,{transportMode:'walk'})).rejects.toThrow('temporary');
  await provider.getTravelTime(origin,destination,{transportMode:'walk'});expect(route).toHaveBeenCalledTimes(3);
 });
 it('separates destination, direction, mode and scheduled departures',()=>{
  const a={latitude:51,longitude:-3},b={latitude:52,longitude:-4};const opts={transportMode:'transit' as const,departureTime:'2099-01-01T09:00:00Z'};
  const keys=[routeCacheKey('Google',a,b,opts),routeCacheKey('Google',b,a,opts),routeCacheKey('Google',a,b,{...opts,transportMode:'drive'}),routeCacheKey('Google',a,b,{...opts,departureTime:'2099-01-01T10:00:00Z'})];expect(new Set(keys).size).toBe(4);
 });
});
it('round-trips map layers, school constraints and viewport while retaining old searches',()=>{
 const criteria={version:1,mode:'live',destinations:[{id:'x',label:'Cardiff',purpose:'Work',latitude:51.48,longitude:-3.17,transportMode:'drive',journeysPerWeek:5,maximumMinutes:60,weight:100,hardMaximum:true}],minimumBudget:0,budget:500000};
 const view={...defaultView(),layers:['schools' as const,'catchments' as const],country:'Wales' as const,phase:'Primary',school:{enabled:true,phase:'Primary',rating:'all',reportArea:'Achievement',maximumWalkMinutes:10},viewport:{latitude:51.51,longitude:-3.58,zoom:13},shading:40};
 expect(restoreCriteria({...criteria,view}).view).toEqual(view);expect(restoreCriteria(criteria).view).toBeUndefined();
 expect(()=>restoreCriteria({...criteria,view:{...view,viewport:{...view.viewport,latitude:200}}})).toThrow();
});
