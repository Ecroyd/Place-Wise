import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {openPointsInView,type OpenDataset} from '../src/lib/server/openPlaces';

const fixture:OpenDataset={source:'t',licence:'t',sourceUrl:'https://example.test',builtAt:'2026-11-25',types:['Bus stop','Pharmacy'],strings:['A','B','C','Leeds'],
  points:[[5300000,-220000,0,0],[5354000,-219000,1,1,3],[5355000,-219500,0,2],[5355000,-250000,0,0],[5400000,-219000,0,0]]};
const view={west:-2.21,east:-2.18,south:53.53,north:53.56};
describe('stored open places',()=>{
  it('returns only points inside the view, with type and extra details',()=>{
    const {points,total}=openPointsInView(fixture,view);
    expect(total).toBe(2);
    expect(points.map(p=>p.name).sort()).toEqual(['B','C']);
    expect(points.find(p=>p.name==='B')!.details).toEqual(['Pharmacy','Leeds']);
    expect(points[0].latitude).toBeCloseTo(53.54+(points[0].name==='C'?0.01:0),2);
  });
  it('keeps those nearest the centre when there are too many',()=>{
    const {points,total}=openPointsInView(fixture,view,1);
    expect(total).toBe(2);expect(points).toHaveLength(1);
  });
  it('ships sorted, well-formed data for all three overlays',()=>{
    for(const name of ['amenities','parks','transport']){
      const data=JSON.parse(readFileSync(`src/data/open-${name}.json`,'utf8')) as OpenDataset;
      expect(data.points.length).toBeGreaterThan(1000);
      for(let i=1;i<data.points.length;i+=997)expect(data.points[i][0]).toBeGreaterThanOrEqual(data.points[i-1][0]);
      const middleton=openPointsInView(data,{west:-2.215,east:-2.18,south:53.54,north:53.56});
      expect(middleton.total).toBeGreaterThan(0);
    }
  });
});

describe('transport stop priority',()=>{
  it('keeps stations ahead of bus stops when a view has too many',()=>{
    const data:OpenDataset={source:'t',licence:'t',sourceUrl:'https://example.test',builtAt:'2026-11-25',types:['Bus stop','Rail station'],strings:['Stop','Station'],
      points:[[5354900,-219900,0,0],[5354950,-219950,0,0],[5355900,-218100,1,1]].sort((a,b)=>a[0]-b[0])};
    const {points}=openPointsInView(data,{west:-2.21,east:-2.18,south:53.54,north:53.56},1);
    expect(points[0].details[0]).toBe('Rail station');
  });
});

describe('bus stop thinning',()=>{
  const stops=Array.from({length:40},(_,i)=>[5354000+i*20,-219000+i*20,0,0]);
  const data:OpenDataset={source:'t',licence:'t',sourceUrl:'https://example.test',builtAt:'2026-11-25',types:['Bus stop','Rail station'],strings:['Stop','Station'],
    points:[...stops,[5354400,-218600,1,1],[5354410,-218610,1,1]].sort((a,b)=>a[0]-b[0])};
  it('keeps one bus stop per pin-sized cell when zoomed out, but never drops stations',()=>{
    const wide=openPointsInView(data,{west:-2.5,east:-1.9,south:53.3,north:53.7});
    expect(wide.points.filter(p=>p.details[0]==='Bus stop').length).toBeLessThan(5);
    expect(wide.points.filter(p=>p.details[0]==='Rail station')).toHaveLength(2);
    expect(wide.thinned).toBeGreaterThan(30);
  });
  it('shows every stop when zoomed in to street level',()=>{
    const street:OpenDataset={...data,points:Array.from({length:10},(_,i)=>[5354000+i*100,-219000+i*100,0,0])};
    const close=openPointsInView(street,{west:-2.1905,east:-2.1800,south:53.539,north:53.5495});
    expect(close.thinned).toBe(0);expect(close.points).toHaveLength(10);
  });
});
