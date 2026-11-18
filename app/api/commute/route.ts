import {apiLimit} from '@/src/lib/server/budget';
import { allowedCommuteCell } from "@/src/lib/routing/detail";
import {routeFits} from "@/src/lib/data/combined";
import { z } from "zod";
import { isValidCell } from "h3-js";
import { destinationSchema } from "@/src/schemas/criteria";
import { commuteGrid, sharedCommuteGrid, sampleOrigin, type CommuteSample } from "@/src/lib/routing/commute";
import { getLiveRoutingProvider } from "@/src/lib/routing/provider";
import { routeMany } from "@/src/lib/routing/batch";
import type { JourneyStep } from "@/src/types/domain";

const schema = z.object({ destination: destinationSchema, destinations:z.array(destinationSchema).min(1).max(3).optional(), cells: z.array(z.string().refine(isValidCell, "Invalid heatmap cell")).min(1).max(16) });

// Short-lived, bounded cache: traffic-aware estimates should not persist for months.
const cache = new Map<string, { sample: CommuteSample; expires: number }>();
export async function POST(request: Request) {
 const limited=await apiLimit(request,"commute",600);if(limited)return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid commute heatmap request" }, { status: 400 });
  const { destination, cells } = parsed.data;
  const allowed = new Set((parsed.data.destinations?sharedCommuteGrid(parsed.data.destinations):commuteGrid(destination)).features.map(feature => feature.properties.id));
  if (cells.some(id => !allowedCommuteCell(id, allowed))) return Response.json({ error: "Cell is outside this destination’s sampling area" }, { status: 400 });
  try {
    const provider = getLiveRoutingProvider(destination.transportMode);
    if (provider.constructor.name === "OsrmRoutingProvider" && destination.transportMode !== "drive" && destination.transportMode !== "mixed") {
      return Response.json({ error: "This travel mode needs Google routing configured." }, { status: 422 });
    }
    const samples: CommuteSample[] = [];
    let providerError: string | undefined;
    const noteFailure = (reason: unknown) => { if (reason instanceof Error && reason.name === "RoutingUnavailableError") providerError = reason.message; };
    if (parsed.data.destinations) {
      // Route every cell to each destination in turn; cells drop out as soon as one
      // destination does not fit, so later destinations are never routed for them.
      let remaining = cells.map(id => ({ id, fraction: 0, itinerary: [] as JourneyStep[] }));
      for (const target of parsed.data.destinations) {
        if (request.signal.aborted || !remaining.length) break;
        const routed = await Promise.resolve().then(() => routeMany(getLiveRoutingProvider(target.transportMode), remaining.map(cell => sampleOrigin(cell.id)), target, { transportMode: target.transportMode, departureTime: target.departureTime }))
          .catch((reason: unknown) => remaining.map(() => ({ status: "rejected", reason }) as PromiseRejectedResult));
        remaining = remaining.filter((cell, i) => {
          const result = routed[i];
          if (result.status === "rejected") { noteFailure(result.reason); samples.push({ id: cell.id, minutes: null, outcome: "unavailable" }); return false; }
          if (!routeFits(result.value, target)) { samples.push({ id: cell.id, minutes: null, outcome: "outside", itinerary: cell.itinerary }); return false; }
          cell.fraction = Math.max(cell.fraction, result.value.minutes / (target.maximumMinutes ?? target.preferredMinutes ?? 60));
          cell.itinerary.push({ mode: target.label, minutes: result.value.minutes });
          return true;
        });
      }
      if (!request.signal.aborted) for (const cell of remaining) samples.push({ id: cell.id, minutes: Math.min(100, Math.round(cell.fraction * 100)), itinerary: cell.itinerary });
    } else {
      const keyFor = (id: string) => `${provider.constructor.name}/${id}/${destination.latitude}/${destination.longitude}/${destination.transportMode}/${destination.departureTime ?? "now"}/multimodal-v3`;
      const misses = cells.filter(id => { const hit = cache.get(keyFor(id)); if (hit && hit.expires > Date.now()) { samples.push(hit.sample); return false; } return true; });
      const routed = request.signal.aborted ? [] : await routeMany(provider, misses.map(sampleOrigin), destination, { transportMode: destination.transportMode, departureTime: destination.departureTime });
      routed.forEach((result, i) => {
        const id = misses[i];
        if (result.status === "rejected" || !Number.isFinite(result.value.minutes) || result.value.minutes < 0) {
          if (result.status === "rejected") noteFailure(result.reason);
          samples.push({ id, minutes: null }); return;
        }
        const route = result.value;
        if (cache.size >= 5000) cache.delete(cache.keys().next().value!);
        const sample = { id, minutes: route.minutes, ...(route.selectedMode ? { selectedMode: route.selectedMode } : {}), ...(route.itinerary?.length ? { itinerary: route.itinerary } : {}) };
        cache.set(keyFor(id), { sample, expires: Date.now() + 5 * 60 * 1000 });
        samples.push(sample);
      });
    }
    if (providerError && samples.every(sample => sample.minutes === null)) return Response.json({ error: providerError }, { status: 502 });
    return Response.json({ samples });
  } catch {
    return Response.json({ error: "Commute routing is unavailable. Please try again." }, { status: 502 });
  }
}
