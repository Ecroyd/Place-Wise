import { DeterministicCriteriaParser } from "@/src/lib/ai/parser";
export async function POST(request:Request){const {text}=await request.json();try{return Response.json(await new DeterministicCriteriaParser().parse(text))}catch{return Response.json({error:"Invalid criteria"},{status:400})}}
