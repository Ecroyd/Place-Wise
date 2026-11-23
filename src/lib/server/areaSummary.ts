import {readCached,writeCached} from '@/src/lib/server/responseCache';
import {distanceKm} from '@/src/lib/routing/commute';

// A short introduction to a town or neighbourhood, from Wikipedia (CC BY-SA, attributed
// with a link). An article is only used when its own coordinates are near the area, so a
// same-named place elsewhere ("Whitefield" in Bury, not Whitefield, Maine) is never shown.
export type AreaSummary={text:string;title:string;url:string;source:'Wikipedia'};
const TTL_MS=30*86400000;
const MAX_KM=8;
const memory=new Map<string,{summary:AreaSummary|null;expires:number}>();

type Page={title:string;index?:number;extract?:string;fullurl?:string;coordinates?:{lat:number;lon:number}[];pageprops?:{disambiguation?:string}};

// Drop the pronunciation/etymology bracket that often follows the name, and keep two sentences.
export function tidyExtract(extract:string){
 const text=extract.replace(/\s+/g,' ').trim().replace(/^([^().]{0,60}?)\s*\((?:[^()]|\([^()]*\))*\)(?=\s+(?:is|was|are|were)\b|,)/,'$1');
 // Sentence ends are punctuation followed by a space and a capital, so "10.0 km" or "St. Helens" stay intact.
 const sentences=text.split(/(?<=[.!?])\s+(?=[A-Z"‘“])/);
 let out='';for(const sentence of sentences){if(out&&(out+' '+sentence).length>320)break;out=out?out+' '+sentence:sentence;}
 return out.trim();
}

export function pickPage(pages:Page[],point:{latitude:number;longitude:number}):Page|undefined{
 return pages
  .filter(page=>!(page.pageprops&&'disambiguation' in page.pageprops)&&page.extract&&page.coordinates?.length)
  .map(page=>({page,km:distanceKm(point,{latitude:page.coordinates![0].lat,longitude:page.coordinates![0].lon})}))
  .filter(({km})=>km<=MAX_KM)
  .sort((a,b)=>(a.page.index??99)-(b.page.index??99)||a.km-b.km)[0]?.page;
}

async function search(query:string,point:{latitude:number;longitude:number}){
 const params=new URLSearchParams({action:'query',format:'json',formatversion:'2',redirects:'1',generator:'search',gsrsearch:query,gsrlimit:'6',gsrnamespace:'0',
  prop:'extracts|coordinates|pageprops|info',exintro:'1',explaintext:'1',exlimit:'6',coprimary:'primary',ppprop:'disambiguation',inprop:'url'});
 const response=await fetch(`https://en.wikipedia.org/w/api.php?${params}`,{headers:{'User-Agent':'Commutemap/0.1 (https://commutemap.co.uk)'},signal:AbortSignal.timeout(8000)});
 if(!response.ok)throw new Error(`Wikipedia lookup failed (${response.status})`);
 const payload=await response.json() as {query?:{pages?:Page[]}};
 return pickPage(payload.query?.pages??[],point);
}

export async function areaSummary(name:string,context:string,point:{latitude:number;longitude:number}):Promise<AreaSummary|null>{
 const key=`area-summary:v2:${name.toLowerCase()}:${point.latitude.toFixed(2)},${point.longitude.toFixed(2)}`;
 const hit=memory.get(key);if(hit&&hit.expires>Date.now())return hit.summary;
 const stored=(await readCached<{summary:AreaSummary|null}>([key]).catch(()=>new Map())).get(key);
 if(stored){memory.set(key,{summary:stored.payload.summary,expires:stored.expires});return stored.payload.summary;}
 const page=await search(`${name} ${context}`.trim(),point)??(context?await search(name,point):undefined);
 const summary=page?{text:tidyExtract(page.extract!),title:page.title,url:page.fullurl??`https://en.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g,'_'))}`,source:'Wikipedia' as const}:null;
 const expires=Date.now()+TTL_MS;
 if(memory.size>=2000)memory.delete(memory.keys().next().value!);
 memory.set(key,{summary,expires});
 await writeCached([{key,payload:{summary},expires}]).catch(()=>{});
 return summary;
}
