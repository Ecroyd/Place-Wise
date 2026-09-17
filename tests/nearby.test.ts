import { describe, expect, it } from "vitest";
import { areaAssessment, discoveryPoints, discoveryRadius, uniqueNearbyAreas, type NamedArea } from "../src/lib/data/nearby";
import { distanceKm } from "../src/lib/routing/commute";
import type { DestinationConstraint, LocationCell } from "../src/types/domain";
const london:DestinationConstraint={id:"london",label:"London",purpose:"work",latitude:51.5,longitude:-0.1,transportMode:"drive",journeysPerWeek:5,weight:100,hardMaximum:true,minimumMinutes:10,maximumMinutes:60,maximumDistanceKm:40};
const area:NamedArea={id:"place",name:"Camberwell",address:"Camberwell, London",latitude:51.48,longitude:-0.09};
describe("destination-dependent nearby areas",()=>{
 it("generates discovery points around the selected destination, not Manchester",()=>{
  const points=discoveryPoints(london,40);
  expect(points).toHaveLength(25);
  expect(points.every(point=>distanceKm(point,london)<=40)).toBe(true);
  expect(points.some(point=>point.latitude>53)).toBe(false);
 });
 it("uses a local radius after clicking another map point",()=>{
  expect(discoveryRadius(london,false)).toBe(40);expect(discoveryRadius(london,true)).toBe(12);
 });
 it("deduplicates names and discards distant geocoder results",()=>{
  expect(uniqueNearbyAreas([area,{...area,id:"duplicate"},{...area,id:"distant",name:"Manchester",latitude:53.48,longitude:-2.24}],london,40)).toEqual([area]);
 });
 it("does not invent a price or borrow one from a different locality",()=>{
  const price={town:"Camberwell",latitude:53.48,longitude:-2.24,typicalHousePrice:200000} as LocationCell;
  const result=areaAssessment(area,london,{minutes:25,distanceKm:6},[price],500000);
  expect(result.typicalHousePrice).toBeUndefined();expect(result.withinLimits).toBe(true);
 });
 it("matches real local price data and checks travel/distance constraints",()=>{
  const price={town:area.name,latitude:area.latitude,longitude:area.longitude,typicalHousePrice:550000} as LocationCell;
  const result=areaAssessment(area,london,{minutes:61,distanceKm:45},[price],500000);
  expect(result.typicalHousePrice).toBe(550000);expect(result.withinBudget).toBe(false);expect(result.reasons).toHaveLength(2);
 });
});
