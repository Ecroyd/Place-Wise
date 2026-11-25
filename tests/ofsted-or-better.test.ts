import {describe,expect,it} from 'vitest';
import {matchesSchool,RATING_VALUES} from '../src/lib/data/layers';

const legacy=(grade:string)=>({phase:'Primary',grades:{},legacy:grade});
const modern=(grade:string)=>({phase:'Primary',grades:{Achievement:grade,Inclusion:'Needs attention'},legacy:'1'});
describe('Ofsted "or better" filters',()=>{
  it('Good or better keeps Outstanding and Good, drops the rest',()=>{
    expect(['1','2','3','4'].map(g=>matchesSchool(legacy(g),{rating:'legacy-up:2'}))).toEqual([true,true,false,false]);
    expect(matchesSchool({phase:'Primary',grades:{}},{rating:'legacy-up:2'})).toBe(false); // no grade imported
  });
  it('report-card "or better" uses the chosen report area and ignores old grades for new-style reports',()=>{
    expect(['Exceptional','Strong standard','Expected standard','Needs attention'].map(g=>matchesSchool(modern(g),{rating:'new-up:Strong standard'}))).toEqual([true,true,false,false]);
    expect(matchesSchool(modern('Exceptional'),{rating:'new-up:Strong standard',reportArea:'Inclusion'})).toBe(false);
    expect(matchesSchool(modern('Exceptional'),{rating:'legacy-up:2'})).toBe(false);
  });
  it('the API accepts every option the selector offers',()=>{
    for(const v of ['legacy-up:1','legacy-up:2','legacy-up:3','new-up:Exceptional','new-up:Needs attention','legacy:4','new:Urgent improvement'])expect(RATING_VALUES).toContain(v);
  });
});
