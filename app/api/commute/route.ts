import {routeFits} from "@/src/lib/data/combined";
import { z } from "zod";
import { isValidCell } from "h3-js";
import { destinationSchema } from "@/src/schemas/criteria";
import { commuteGrid, sampleOrigin, type CommuteSample } from "@/src/lib/routing/commute";
import { getLiveRoutingProvider } from "@/src/lib/routing/provider";

const schema = z.object({ destination: destinationSchema, destinations:z.array(destinationSchema).min(1).max(3).optional(), cells: z.array(z.string().refine(isValidCell, "Invalid heatmap cell")).min(1).max(16) });

// Short-lived, bounded cache: traffic-aware estimates should not persist for months.
const cache = new Map<string, { sample: CommuteSample; expires: number }>();
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid commute heatmap request" }, { status: 400 });
  const { destination, cells } = parsed.data;
  const allowed = new Set(commuteGrid(destination).features.map(feature => feature.properties.id));
  if (cells.some(id => !allowed.has(id))) return Response.json({ error: "Cell is outside this destination’s sampling area" }, { status: 400 });
  try {
    const provider = getLiveRoutingProvider(destination.transportMode);
    if (provider.constructor.name === "OsrmRoutingProvider" && destination.transportMode !== "drive" && destination.transportMode !== "mixed") {
      return Response.json({ error: "This travel mode needs Google routing configured." }, { status: 422 });
    }
    const samples: CommuteSample[] = [];
    let next = 0;
    let providerError: string | undefined;
    await Promise.all(Array.from({ length: Math.min(4, cells.length) }, async () => {
      while (next < cells.length) {
        const id = cells[next++];
        const key = `${provider.constructor.name}/${id}/${destination.latitude}/${destination.longitude}/${destination.transportMode}/${destination.departureTime ?? "now"}/multimodal-v3`;
        const hit = parsed.data.destinations?undefined:cache.get(key);
        if (hit && hit.expires > Date.now()) { samples.push(hit.sample); continue; }
        try {
          if(parsed.data.destinations){
            const itinerary=[];let fraction=0;let matches=true;
            for(const target of parsed.data.destinations){
              if(request.signal.aborted)throw Error('Cancelled');
              const targetProvider=getLiveRoutingProvider(target.transportMode);
              const route=await targetProvider.getTravelTime(sampleOrigin(id),target,{transportMode:target.transportMode,departureTime:target.departureTime});
              if(!routeFits(route,target)){matches=false;break;}
              fraction=Math.max(fraction,route.minutes/(target.maximumMinutes??target.preferredMinutes??60));
              itinerary.push({mode:target.label,minutes:route.minutes});
            }
            samples.push({id,minutes:matches?Math.min(100,Math.round(fraction*100)):null,itinerary});continue;
          }
          const route = await provider.getTravelTime(sampleOrigin(id), destination, { transportMode: destination.transportMode, departureTime: destination.departureTime });
          if (!Number.isFinite(route.minutes) || route.minutes < 0) throw new Error("Invalid route duration");
          if (cache.size >= 5000) cache.delete(cache.keys().next().value!);
          const sample = { id, minutes: route.minutes, ...(route.selectedMode ? { selectedMode: route.selectedMode } : {}), ...(route.itinerary?.length ? { itinerary: route.itinerary } : {}) };
          cache.set(key, { sample, expires: Date.now() + 5 * 60 * 1000 });
          samples.push(sample);
        } catch (error) { if (error instanceof Error && error.name === "RoutingUnavailableError") providerError = error.message; samples.push({ id, minutes: null }); }
      }
    }));
    if (providerError && samples.every(sample => sample.minutes === null)) return Response.json({ error: providerError }, { status: 502 });
    return Response.json({ samples });
  } catch {
    return Response.json({ error: "Commute routing is unavailable. Please try again." }, { status: 502 });
  }
}
