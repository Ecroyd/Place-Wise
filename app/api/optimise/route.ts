import { searchCriteriaSchema } from "@/src/schemas/criteria";
import { listLocationCells } from "@/src/lib/data/locationRepository";
import { optimise } from "@/src/lib/optimisation/engine";
import { CachedRoutingProvider,SupabaseTravelTimeCache } from "@/src/lib/routing/cache";
import { getLiveRoutingProvider } from "@/src/lib/routing/provider";
export async function POST(request:Request){
 const parsed=searchCriteriaSchema.safeParse(await request.json());
 if(!parsed.success)return Response.json({error:parsed.error.flatten()},{status:400});
 try {const cells=await listLocationCells();if(!cells.length)throw new Error("No live location cells are loaded");return Response.json(await optimise(parsed.data,cells,new CachedRoutingProvider(getLiveRoutingProvider(),new SupabaseTravelTimeCache())))}
 catch(error){return Response.json({error:error instanceof Error?error.message:"Optimisation failed"},{status:502})}
}
