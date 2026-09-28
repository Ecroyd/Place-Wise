import {describe,it,expect} from 'vitest';
import {restoreCriteria,savedCriteriaSchema} from '../src/lib/account/searches';
const destination={id:'one',label:'Cardiff',purpose:'Work',latitude:51.48,longitude:-3.17,transportMode:'drive',journeysPerWeek:5,minimumMinutes:10,maximumMinutes:60,minimumDistanceKm:0,maximumDistanceKm:40,weight:100,hardMaximum:true};
const criteria={version:1,mode:'live',destinations:[destination,{...destination,id:'two',label:'Swansea',longitude:-3.94,maximumMinutes:45,transportMode:'transit'}],minimumBudget:200000,budget:500000};
describe('saved searches',()=>{
 it('round-trips multiple destinations, individual journey settings and the full budget range',()=>{expect(restoreCriteria(criteria)).toEqual(criteria);});
 it('rejects malformed or unsupported saved data',()=>{expect(savedCriteriaSchema.safeParse({...criteria,version:2}).success).toBe(false);expect(savedCriteriaSchema.safeParse({...criteria,minimumBudget:600000}).success).toBe(false);expect(savedCriteriaSchema.safeParse({...criteria,destinations:[]}).success).toBe(false);expect(savedCriteriaSchema.safeParse({...criteria,destinations:[{...destination,latitude:100}]}).success).toBe(false);});
 it('refreshes expired departure times without discarding a future scheduled journey',()=>{const past={...destination,departureTime:'2020-01-01T09:00:00.000Z'};const future={...destination,id:'future',departureTime:'2099-01-01T09:00:00.000Z'};const restored=restoreCriteria({...criteria,destinations:[past,future]});expect(restored.destinations[0].departureTime).toBeUndefined();expect(restored.destinations[1].departureTime).toBe(future.departureTime);});
});
