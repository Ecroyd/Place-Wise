import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {GET as layers} from '../app/api/layers/route';
import {GET as catchments} from '../app/api/catchments/route';
import {matchesSchool} from '../src/lib/data/layers';
const data=JSON.parse(readFileSync('src/data/regional-schools.json','utf8'));
describe('Welsh and Scottish schools',()=>{
 it('contains unique official records and no manufactured inspection grades',()=>{
  expect(data.schools.filter((s:{country:string})=>s.country==='Wales')).toHaveLength(1440);
  expect(data.schools.filter((s:{country:string})=>s.country==='Scotland')).toHaveLength(2403);
  expect(new Set(data.schools.map((s:{id:string})=>s.id)).size).toBe(data.schools.length);
  for(const s of data.schools){expect(s.grades).toEqual({});expect(s.latitude).toBeGreaterThan(51);expect(s.latitude).toBeLessThan(61);expect(s.longitude).toBeGreaterThan(-9);expect(s.longitude).toBeLessThan(2);expect(s.phases.length).toBeGreaterThan(0);expect(matchesSchool(s,{country:s.country,rating:'all'})).toBe(true);expect(matchesSchool(s,{country:'England'})).toBe(false);expect(matchesSchool(s,{rating:'legacy:1'})).toBe(false);}
 });
 it.each([['Wales',-3.3,-3.1,51.4,51.6,'Estyn'],['Scotland',-3.3,-3.1,55.9,56.0,'Scottish']])('serves %s schools with the correct inspection links',async(country,west,east,south,north,inspector)=>{
  const params=new URLSearchParams({layer:'schools',country:String(country),west:String(west),east:String(east),south:String(south),north:String(north)});
  const response=await layers(new Request('http://localhost/api/layers?'+params));const result=await response.json();expect(response.status).toBe(200);expect(result.points.length).toBeGreaterThan(10);
  for(const point of result.points){expect(point.details).toContain(country);expect(point.urlLabel).toContain(inspector);expect(point.url).not.toContain('ofsted');}
  params.set('rating','legacy:1');expect((await (await layers(new Request('http://localhost/api/layers?'+params))).json()).points).toEqual([]);
 });
 it.each(['wales:6602130','scotland:1000047'])('accepts %s without inventing a catchment',async school=>{
  const response=await catchments(new Request('http://localhost/api/catchments?west=-4&east=-3&south=51&north=52&school='+school));expect(response.status).toBe(200);expect((await response.json()).features).toEqual([]);
 });
});
