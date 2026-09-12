import {z} from "zod";
const requestSchema=z.object({address:z.string().trim().min(2).max(200)});
export async function POST(request:Request){
 const parsed=requestSchema.safeParse(await request.json());
 if(!parsed.success)return Response.json({error:"Enter a valid destination"},{status:400});
 const key=process.env.GOOGLE_MAPS_API_KEY;
 if(!key)return Response.json({error:"Google Geocoding is not configured"},{status:503});
 const url=new URL("https://maps.googleapis.com/maps/api/geocode/json");
 url.searchParams.set("address",parsed.data.address+", UK");url.searchParams.set("region","uk");url.searchParams.set("key",key);
 const response=await fetch(url);const payload=await response.json() as {status:string;error_message?:string;results?:{formatted_address:string;geometry:{location:{lat:number;lng:number}}}[]};
 const result=payload.results?.[0];
 if(payload.status!=="OK"||!result)return Response.json({error:payload.error_message??"Destination not found"},{status:404});
 return Response.json({label:result.formatted_address,latitude:result.geometry.location.lat,longitude:result.geometry.location.lng});
}
