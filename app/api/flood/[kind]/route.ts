import {z} from 'zod';
const bounds=z.array(z.number().finite().min(-21000000).max(21000000)).length(4).refine(b=>b[0]<b[2]&&b[1]<b[3]);
export async function GET(request:Request,{params}:{params:Promise<{kind:string}>}){
  const {kind}=await params;if(kind!=='river'&&kind!=='surface')return new Response('Unknown layer',{status:400});
  const parsed=bounds.safeParse(new URL(request.url).searchParams.get('bbox')?.split(',').map(Number));if(!parsed.success)return new Response('Invalid bounds',{status:400});
  const service=kind==='river'?'nafra2-risk-of-flooding-from-rivers-and-sea':'nafra2-risk-of-flooding-from-surface-water';
  const url=new URL(`https://environment.data.gov.uk/spatialdata/${service}/wms`);url.search=new URLSearchParams({service:'WMS',version:'1.1.1',request:'GetMap',layers:kind==='river'?'rofrs_4band':'rofsw',styles:'',format:'image/png',transparent:'true',srs:'EPSG:3857',width:'256',height:'256',bbox:parsed.data.join(',')}).toString();
  try{const response=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!response.ok||!response.headers.get('content-type')?.includes('image/'))throw Error('Flood map unavailable');return new Response(await response.arrayBuffer(),{headers:{'Content-Type':'image/png','Cache-Control':'public, max-age=86400'}});}catch{return new Response('Flood map provider unavailable',{status:502});}
}
