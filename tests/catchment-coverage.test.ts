import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {CATCHMENT_COUNCILS,catchmentsInView,type CatchmentData} from '../src/lib/data/catchments';

const data=JSON.parse(readFileSync('src/data/catchments.json','utf8')) as CatchmentData;
describe('published catchment coverage',()=>{
  it('lists exactly the councils in the data file, each with polygons',()=>{
    const councils=new Set(data.features.map(f=>f.properties.council));
    expect([...councils].sort()).toEqual([...CATCHMENT_COUNCILS].sort());
    for(const f of data.features)expect(['Polygon','MultiPolygon']).toContain(f.geometry.type);
  });
  it('links most boundaries to a school pin so clicking a school shows its own catchment',()=>{
    const linked=data.features.filter(f=>f.properties.urn).length;
    expect(linked/data.features.length).toBeGreaterThan(0.9);
    const sheffield=data.features.find(f=>f.properties.council==='Sheffield'&&f.properties.urn)!;
    expect(catchmentsInView(data,{west:-1.6,east:-1.4,south:53.3,north:53.45},'All',sheffield.properties.urn).features.map(f=>f.properties.urn)).toContain(sheffield.properties.urn);
  });
  it('sends nothing for a region-wide view, but does once zoomed in to a town',()=>{
    const wide=catchmentsInView(data,{west:-3,east:0,south:50.5,north:52.5});
    expect(wide.features).toHaveLength(0);expect(wide.tooWide).toBe(true);
    const town=catchmentsInView(data,{west:-1.55,east:-1.4,south:53.35,north:53.42});
    expect(town.features.length).toBeGreaterThan(5);expect(town.tooWide).toBe(false);
  });
  it('stays small enough to serve',()=>{
    expect(readFileSync('src/data/catchments.json').length).toBeLessThan(12_000_000);
  });
});

import {ringPolygon,DISTANCE_RINGS_M} from '../src/components/CatchmentOverlay';
describe('straight-line distance rings',()=>{
  it('draws each ring at its stated distance from the school',()=>{
    const school={latitude:53.55,longitude:-2.2};
    const km=(a:[number,number])=>{const r=Math.PI/180;const dLat=(a[1]-school.latitude)*r,dLon=(a[0]-school.longitude)*r;return 12742*Math.asin(Math.sqrt(Math.sin(dLat/2)**2+Math.cos(school.latitude*r)*Math.cos(a[1]*r)*Math.sin(dLon/2)**2));};
    for(const metres of DISTANCE_RINGS_M)for(const point of ringPolygon(school,metres,12))expect(Math.abs(km(point)*1000-metres)).toBeLessThan(2);
  });
});
