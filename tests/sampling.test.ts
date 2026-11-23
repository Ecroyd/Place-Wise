import {describe,it,expect} from 'vitest';
import {overviewSamples,sampleLimit} from '../src/lib/routing/sampling';
import {commuteGrid,sharedCommuteGrid,sampleOrigin,distanceKm} from '../src/lib/routing/commute';
import type {DestinationConstraint} from '../src/types/domain';
const a:DestinationConstraint={id:'a',label:'Cardiff',purpose:'Work',latitude:51.4816,longitude:-3.1791,transportMode:'drive',journeysPerWeek:5,maximumMinutes:60,maximumDistanceKm:40,weight:100,hardMaximum:true};
describe('low cost route sampling',()=>{
 it('reduces thousands of fine cells to 96 unique geographically distributed real samples',()=>{
  const grid=commuteGrid(a);const ids=overviewSamples(grid,[a]);expect(grid.features.length).toBeGreaterThan(1000);expect(ids).toHaveLength(96);expect(new Set(ids).size).toBe(96);
  const allowed=new Set(grid.features.map(f=>f.properties.id));for(const id of ids){expect(allowed.has(id)).toBe(true);expect(distanceKm(sampleOrigin(id),a)).toBeLessThanOrEqual(41);}
  expect(ids.some(id=>distanceKm(sampleOrigin(id),a)>30)).toBe(true);expect(ids.some(id=>distanceKm(sampleOrigin(id),a)<5)).toBe(true);
 });
 it('budgets extra destinations, public-transport walking comparisons and any-mode comparisons',()=>{
  expect(sampleLimit([a,a])).toBe(48);expect(sampleLimit([{...a,transportMode:'any'}])).toBe(19);expect(sampleLimit([{...a,transportMode:'transit'},a])).toBe(32);expect(sampleLimit([a],48)).toBe(48);
 });
 it('samples the intersection and handles empty shared areas',()=>{
  const b={...a,id:'b',latitude:51.6214,longitude:-3.9436,maximumMinutes:45};const grid=sharedCommuteGrid([a,b]);expect(overviewSamples(grid,[a,b]).length).toBeLessThanOrEqual(48);
  expect(overviewSamples({type:'FeatureCollection',features:[]},[a])).toEqual([]);
 });
});

import {overviewDisplayGrid,displaySampleAt} from '../src/lib/routing/sampling';
import {commuteGrid as gridFor} from '../src/lib/routing/commute';
import {getHexagonAreaAvg,getResolution,UNITS,cellToLatLng} from 'h3-js';
describe('overview display',()=>{
 it('draws each sample as a hexagon sized to the sample spacing, keeping its routed id',()=>{
  const destination={id:'d',label:'Middleton',purpose:'Work',latitude:53.55,longitude:-2.2,transportMode:'drive' as const,journeysPerWeek:5,minimumMinutes:10,maximumMinutes:60,preferredMinutes:30,weight:100,hardMaximum:true};
  const grid=gridFor(destination);
  const ids=overviewSamples(grid,[destination]);
  const display=overviewDisplayGrid(grid,ids);
  expect(display.features.map(f=>f.properties.id)).toEqual(ids);
  const fine=getHexagonAreaAvg(getResolution(ids[0]),UNITS.km2);
  const drawn=[...display.cellFor.keys()].map(id=>getHexagonAreaAvg(getResolution(id),UNITS.km2));
  expect(Math.max(...drawn)).toBeGreaterThan(fine*5);
  expect(new Set(display.cellFor.keys()).size).toBe(ids.length);
  const [cell,id]=[...display.cellFor.entries()][0];const [lat,lng]=cellToLatLng(cell);
  expect(displaySampleAt(display,{latitude:lat,longitude:lng})).toBe(id);
 });
});
