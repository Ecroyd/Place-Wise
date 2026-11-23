import {withPayer} from '@/src/lib/server/payer';
import {sampleLimit} from '@/src/lib/routing/sampling';
import {apiLimit} from '@/src/lib/server/budget';
import {reverseGeocode,GOOGLE_GEOCODE_TTL_MS,OPEN_GEOCODE_TTL_MS} from '@/src/lib/server/geocoding';
import { z } from "zod";
import { coordinatesSchema, destinationSchema } from "@/src/schemas/criteria";
import { listLocationCells } from "@/src/lib/data/locationRepository";
import { getLiveRoutingProvider } from "@/src/lib/routing/provider";
import { routeMany } from "@/src/lib/routing/batch";
import { readCached, writeCached } from "@/src/lib/server/responseCache";
import { areaAssessment, discoveryPoints, discoveryRadius, uniqueNearbyAreas, type NamedArea, type NearbyArea } from "@/src/lib/data/nearby";

const schema = z.object({ destination: destinationSchema, destinations:z.array(destinationSchema).min(1).max(3).optional(), center: coordinatesSchema.optional(), budget: z.number().positive().optional() });
const names = new Map<string, { area: NamedArea | null; expires: number }>();
async function reverse(point: { latitude: number; longitude: number }): Promise<NamedArea | null> {
  // ~110 m precision: nearby searches share lookups for the same neighbourhood.
  const key = `${point.latitude.toFixed(3)},${point.longitude.toFixed(3)}`;
  const cached = names.get(key);
  if (cached && cached.expires > Date.now()) return cached.area;
  const cacheKey = "reverse-geocode:v2:" + key;
  const stored = (await readCached<NamedArea | null>([cacheKey]).catch(() => new Map())).get(cacheKey);
  if (stored) { names.set(key, { area: stored.payload, expires: stored.expires }); return stored.payload; }
  const { area, source } = await reverseGeocode(point);
  if (names.size >= 500) names.delete(names.keys().next().value!);
  const expires = Date.now() + (source === "google" ? GOOGLE_GEOCODE_TTL_MS : OPEN_GEOCODE_TTL_MS);
  names.set(key, { area, expires });
  await writeCached([{ key: cacheKey, payload: area, expires }]).catch(() => undefined);
  return area;
}
async function mapLimited<T, R>(items: T[], action: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(4,items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await action(items[index]); }
  }));
  return results;
}
async function handlePost(request: Request){
 const limited=await apiLimit(request,"areas",60);if(limited)return limited;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid nearby-area search" }, { status: 400 });
  const { destination, budget } = parsed.data;
  const center = parsed.data.center ?? destination;
  try {
    const radius = discoveryRadius(destination, !!parsed.data.center);
    let lookupFailures = 0;
    const [named, prices] = await Promise.all([
      mapLimited(discoveryPoints(center,radius).filter((_,index)=>index===0||index%3===1), async point => { try { return await reverse(point); } catch { lookupFailures++; return null; } }),
      listLocationCells().catch(() => []),
    ]);
    if (lookupFailures === named.length) throw new Error("Nearby area lookup is temporarily unavailable");
    // When searching around the destination itself, its spot is the place the person
    // typed in (e.g. "Middleton, Rochdale"); open data can label it a nearby neighbourhood.
    if (!parsed.data.center && named[0]) {
      const [name, ...rest] = destination.label.split(",").map(part => part.trim());
      named[0] = { ...named[0], id: "destination:" + destination.id, name, address: [name, ...rest].join(", "), latitude: center.latitude, longitude: center.longitude };
    }
    const areas = uniqueNearbyAreas(named.filter((area): area is NamedArea => area !== null), center, radius);
    const destinations=parsed.data.destinations??[destination];
    const checked = areas.slice(0,Math.min(8,sampleLimit(destinations,32)));
    // One batched lookup per destination instead of one request per area.
    const routedByDestination = await Promise.all(destinations.map(destination => request.signal.aborted ? checked.map(() => null)
      : Promise.resolve().then(() => routeMany(getLiveRoutingProvider(destination.transportMode), checked, destination, { transportMode: destination.transportMode, departureTime: destination.departureTime }))
        .then(results => results.map(result => result.status === "fulfilled" ? result.value : null))
        .catch(() => checked.map(() => null))));
    const results: NearbyArea[] = checked.map((area, index) => {
      const assessments = destinations.map((destination, d) => areaAssessment(area, destination, routedByDestination[d][index], prices, budget));
      return {...assessments[0],withinLimits:assessments.every(a=>a.withinLimits),reasons:assessments.flatMap((a,i)=>a.reasons.map(reason=>destinations[i].label+': '+reason)),destinationJourneys:assessments.map((a,i)=>({label:destinations[i].label,minutes:a.minutes,mode:destinations[i].transportMode}))};
    });
    results.sort((a,b) => Number(b.withinLimits)-Number(a.withinLimits) || (a.minutes ?? Infinity)-(b.minutes ?? Infinity));
    return Response.json({ areas: results, centerLabel: named[0]?.name ?? "the selected point", lookupFailures });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nearby areas unavailable" }, { status: 502 });
  }
}

// Google calls made while handling this request are paid from the signed-in user's credit once the free allowance is used.
export async function POST(request: Request) { return withPayer(request, () => handlePost(request)); }
