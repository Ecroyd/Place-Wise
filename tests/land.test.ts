import {describe,expect,it} from 'vitest';
import {cellToLatLng} from 'h3-js';
import {onLand} from '../src/lib/routing/land';
import {overviewSamples,overviewDisplayGrid} from '../src/lib/routing/sampling';
import {commuteGrid,sampleOrigin} from '../src/lib/routing/commute';

describe('land outline',()=>{
  it('tells estuaries and bays from the land around them',()=>{
    for(const [lat,lng] of [[53.30,-3.17],[53.5,-3.3],[54.1,-2.95]])expect(onLand({latitude:lat,longitude:lng})).toBe(false);
    for(const [lat,lng] of [[53.247,-3.135],[53.29,-3.065],[53.39,-3.18],[53.55,-2.2],[51.5,-0.12],[55.95,-3.19]])expect(onLand({latitude:lat,longitude:lng})).toBe(true);
  });
  it('never samples or shades open water (the Dee estuary for a Middleton drive)',()=>{
    const d={id:'d',label:'Middleton',purpose:'Work',latitude:53.55,longitude:-2.2,transportMode:'drive' as const,journeysPerWeek:5,maximumMinutes:60,weight:100,hardMaximum:true};
    const grid=commuteGrid(d);const ids=overviewSamples(grid,[d],384);
    expect(ids.every(id=>onLand(sampleOrigin(id)))).toBe(true);
    const tiles=[...overviewDisplayGrid(grid,ids).cellFor.keys()].map(c=>cellToLatLng(c));
    expect(tiles.every(([latitude,longitude])=>onLand({latitude,longitude}))).toBe(true);
    expect(tiles.some(([la,lo])=>la>53.22&&la<53.27&&lo>-3.2&&lo<-3.08)).toBe(true); // Flint itself is still shaded
  });
});
