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

import {overviewDisplayGrid,displaySampleAt,overviewBudget,cellsPerRequest} from '../src/lib/routing/sampling';
import {commuteGrid as gridFor} from '../src/lib/routing/commute';
import {getHexagonAreaAvg,getResolution,UNITS,cellToLatLng} from 'h3-js';
const middleton={id:'d',label:'Middleton',purpose:'Work',latitude:53.55,longitude:-2.2,transportMode:'drive' as const,journeysPerWeek:5,minimumMinutes:10,maximumMinutes:60,preferredMinutes:30,weight:100,hardMaximum:true};
describe('free routing budget',()=>{
 it('samples four times as densely when every journey uses free open routing',()=>{
  expect(overviewBudget([middleton])).toBe(384);expect(cellsPerRequest([middleton])).toBe(48);
  expect(overviewBudget([{...middleton,transportMode:'cycle'}])).toBe(384);
  expect(overviewBudget([{...middleton,departureTime:'2026-11-24T08:00:00Z'}])).toBe(96);
  expect(overviewBudget([{...middleton,transportMode:'transit',departureTime:'2026-11-24T08:00:00Z'}])).toBe(96);
  expect(cellsPerRequest([middleton,{...middleton,departureTime:'2026-11-24T08:00:00Z'}])).toBe(16);
 });
 it('packs samples closer together near the destination',()=>{
  const grid=gridFor(middleton);const ids=overviewSamples(grid,[middleton],384);
  expect(ids.length).toBe(384);
  const dist=ids.map(id=>distanceKm(sampleOrigin(id),middleton));const radius=Math.max(...dist);
  // Count per unit area: inner fifth of the radius vs the outer half of it.
  const inner=dist.filter(d=>d<radius*0.2).length/(0.2**2);const outer=dist.filter(d=>d>radius*0.5).length/(1-0.5**2);
  expect(inner).toBeGreaterThan(outer*4);
 });
});
describe('overview display',()=>{
 it('gives every part of the sampling area to its nearest routed sample, small near the centre',()=>{
  const grid=gridFor(middleton);
  const ids=overviewSamples(grid,[middleton],384);
  const display=overviewDisplayGrid(grid,ids);
  const shown=display.features.map(f=>f.properties.id);
  expect(new Set(shown).size).toBe(shown.length);expect(shown.every(id=>ids.includes(id))).toBe(true);
  expect(shown.length).toBeGreaterThan(ids.length*0.95);
  const tiles=[...display.cellFor.keys()];
  const area=new Map<string,number>();for(const [tile,id] of display.cellFor)area.set(id,(area.get(id)??0)+getHexagonAreaAvg(getResolution(tile),UNITS.km2));
  const areaNear=(near:boolean)=>{const list=ids.filter(id=>(distanceKm(sampleOrigin(id),middleton)<20)===near).map(id=>area.get(id)??0).sort((a,b)=>a-b);return list[Math.floor(list.length/2)];};
  expect(areaNear(true)).toBeLessThan(areaNear(false)/3);
  expect(areaNear(true)).toBeLessThan(25);
  // Each tile belongs to its closest sample.
  for(const tile of tiles.filter((_,i)=>i%97===0)){
   const at=sampleOrigin(tile);const owner=display.cellFor.get(tile)!;
   const closest=Math.min(...ids.map(id=>distanceKm(sampleOrigin(id),at)));
   expect(distanceKm(sampleOrigin(owner),at)).toBeLessThanOrEqual(closest+0.05);
  }
  const [cell,id]=[...display.cellFor.entries()][0];const [lat,lng]=cellToLatLng(cell);
  expect(displaySampleAt(display,{latitude:lat,longitude:lng})).toBe(id);
 });
});

describe('shading stays where journeys were checked',()=>{
  it('never shades beyond the distance limit or far from a checked point (Middleton, 60 min, 40 km)',()=>{
    const search={...middleton,latitude:53.55047,longitude:-2.19733,maximumDistanceKm:40};
    const grid=gridFor(search);const ids=overviewSamples(grid,[search],384);
    const display=overviewDisplayGrid(grid,ids,[search]);
    let furthestFromDestination=0,furthestFromOwner=0;
    for(const [tile,owner] of display.cellFor){const [lat,lng]=cellToLatLng(tile);const at={latitude:lat,longitude:lng};
      furthestFromDestination=Math.max(furthestFromDestination,distanceKm(at,search));furthestFromOwner=Math.max(furthestFromOwner,distanceKm(at,sampleOrigin(owner)));}
    expect(furthestFromDestination).toBeLessThanOrEqual(42);
    expect(furthestFromOwner).toBeLessThan(10);
    expect(display.cellFor.size).toBeGreaterThan(500);
  });
});
