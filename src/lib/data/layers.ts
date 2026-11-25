export const layerDefinitions = [
  {id:'schools',label:'Schools & inspections',colour:'#6944a5',symbol:'S'},
  {id:'catchments',label:'Published school catchments',colour:'#75329d',symbol:'◯'},
  {id:'property',label:'Sold property prices',colour:'#b27315',symbol:'£'},
  {id:'crime',label:'Reported crime',colour:'#b74454',symbol:'C'},
  {id:'parks',label:'Parks & green space',colour:'#288352',symbol:'P'},
  {id:'amenities',label:'Everyday amenities',colour:'#bc622e',symbol:'A'},
  {id:'transport',label:'Public transport stops',colour:'#267caa',symbol:'T'},
  {id:'river',label:'River & coastal flooding',colour:'#425ec7',symbol:'~'},
  {id:'surface',label:'Surface-water flooding',colour:'#329ccb',symbol:'~'},
] as const;
export type LayerId = typeof layerDefinitions[number]['id'];
export type PointLayer = Exclude<LayerId,'river'|'surface'|'catchments'>;
export interface LayerPoint {id:string;name:string;latitude:number;longitude:number;details:string[];url?:string;phase?:string;price?:number;sector?:string;urlLabel?:string}
export interface LayerData {points:LayerPoint[];note:string;source:string;sourceUrl:string;total?:number}
export interface ViewBounds {west:number;south:number;east:number;north:number}
export function inside(point:{latitude:number;longitude:number},b:ViewBounds){return point.latitude>=b.south&&point.latitude<=b.north&&point.longitude>=b.west&&point.longitude<=b.east;}
export const legacyGrade=(value?:string)=>value?({'1':'Outstanding','2':'Good','3':'Requires improvement','4':'Inadequate'}[value]??'Not graded'):'Not graded';

export interface SchoolFilter {country?:string;sector?:string;phase?:string;rating?:string;reportArea?:string}
// Ofsted grades, best first. "…-up:" values mean "this grade or better".
// How each kind of transport stop looks on the map (type names come from the NaPTAN build).
export const STOP_STYLES:Record<string,{symbol:string;colour:string;label:string;size?:'small'|'large'}>={
  'Rail station':{symbol:'R',colour:'#c0392b',label:'Rail station',size:'large'},
  'Tram / metro / underground':{symbol:'M',colour:'#7d3c98',label:'Tram, metro or underground',size:'large'},
  'Ferry terminal':{symbol:'F',colour:'#13808a',label:'Ferry'},
  'Bus station':{symbol:'B',colour:'#1f5f8b',label:'Bus station'},
  'Bus stop':{symbol:'b',colour:'#5b7a99',label:'Bus stop',size:'small'},
};
export const LEGACY_GRADES=[['1','Outstanding'],['2','Good'],['3','Requires improvement'],['4','Inadequate']] as const;
export const NEW_GRADES=['Exceptional','Strong standard','Expected standard','Needs attention','Urgent improvement'] as const;
export const RATING_VALUES=['all',...LEGACY_GRADES.flatMap(([v])=>['legacy:'+v,'legacy-up:'+v]),...NEW_GRADES.flatMap(g=>['new:'+g,'new-up:'+g])] as [string,...string[]];
export function matchesSchool(s:{country?:string;phase:string;phases?:string[];sector?:string;grades:Record<string,string>;legacy?:string},filter:SchoolFilter){
 if(filter.country&&filter.country!=='all'&&(s.country??'England')!==filter.country)return false;
 if(filter.sector&&filter.sector!=='all'&&(s.sector??'state')!==filter.sector)return false;
 if(filter.phase&&filter.phase!=='All'&&!(s.phases??[s.phase]).includes(filter.phase))return false;
 const rating=filter.rating??'all';if(rating==='all')return true;
 const modern=Object.keys(s.grades).length>0;
 if(rating.startsWith('legacy:'))return !modern&&s.legacy===rating.slice(7);
 if(rating.startsWith('legacy-up:'))return !modern&&!!s.legacy&&/^[1-4]$/.test(s.legacy)&&Number(s.legacy)<=Number(rating.slice(10));
 if(rating.startsWith('new:'))return modern&&s.grades[filter.reportArea??'Achievement']===rating.slice(4);
 if(rating.startsWith('new-up:')){const grade=s.grades[filter.reportArea??'Achievement'];const rank=(NEW_GRADES as readonly string[]).indexOf(grade);return modern&&rank>=0&&rank<=(NEW_GRADES as readonly string[]).indexOf(rating.slice(7));}
 return false;
}
