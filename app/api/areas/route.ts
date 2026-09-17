import { z } from "zod";
import { coordinatesSchema, destinationSchema } from "@/src/schemas/criteria";
import { listLocationCells } from "@/src/lib/data/locationRepository";
import { getLiveRoutingProvider } from "@/src/lib/routing/provider";
import { areaAssessment, discoveryPoints, discoveryRadius, uniqueNearbyAreas, type NamedArea, type NearbyArea } from "@/src/lib/data/nearby";

const schema = z.object({ destination: destinationSchema, destinations:z.array(destinationSchema).min(1).max(3).optional(), center: coordinatesSchema.optional(), budget: z.number().positive().optional() });
type Geocoded = { place_id: string; formatted_address: string; types: string[]; address_components: { long_name: string; types: string[] }[]; geometry: { location: { lat: number; lng: number } } };
const names = new Map<string, { area: NamedArea | null; expires: number }>();
async function reverse(point: { latitude: number; longitude: number }): Promise<NamedArea | null> {
  const key = `${point.latitude.toFixed(4)},${point.longitude.toFixed(4)}`;
  const cached = names.get(key);
  if (cached && cached.expires > Date.now()) return cached.area;
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) throw new Error("Area lookup is not configured");
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("latlng", key); url.searchParams.set("key", apiKey);
  url.searchParams.set("result_type", "locality|postal_town|sublocality|neighborhood");
  const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error("Area lookup unavailable");
  const payload = await response.json() as { status: string; results?: Geocoded[] };
  if (payload.status !== "OK" && payload.status !== "ZERO_RESULTS") throw new Error("Area lookup unavailable");
  const result = payload.results?.[0];
  const component = result?.address_components.find(component => component.types.some(type => ["neighborhood", "sublocality", "locality", "postal_town"].includes(type)));
  const area = result && component ? { id: result.place_id, name: component.long_name, address: result.formatted_address,
    latitude: result.geometry.location.lat, longitude: result.geometry.location.lng } : null;
  if (names.size >= 500) names.delete(names.keys().next().value!);
  names.set(key, { area, expires: Date.now() + 86400000 });
  return area;
}
async function mapLimited<T, R>(items: T[], action: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(4,items.length) }, async () => {
    while (next < items.length) { const index = next++; results[index] = await action(items[index]); }
  }));
  return results;
}
export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid nearby-area search" }, { status: 400 });
  const { destination, budget } = parsed.data;
  const center = parsed.data.center ?? destination;
  try {
    const radius = discoveryRadius(destination, !!parsed.data.center);
    let lookupFailures = 0;
    const [named, prices] = await Promise.all([
      mapLimited(discoveryPoints(center,radius), async point => { try { return await reverse(point); } catch { lookupFailures++; return null; } }),
      listLocationCells().catch(() => []),
    ]);
    if (lookupFailures === named.length) throw new Error("Nearby area lookup is temporarily unavailable");
    const areas = uniqueNearbyAreas(named.filter((area): area is NamedArea => area !== null), center, radius);
    const destinations=parsed.data.destinations??[destination];
    const results: NearbyArea[] = await mapLimited(areas, async area => {
      const assessments=await Promise.all(destinations.map(async destination=>{
      const provider=getLiveRoutingProvider(destination.transportMode);
      if (request.signal.aborted) return areaAssessment(area,destination,null,prices,budget);
      try {
        const route = await provider.getTravelTime(area,destination,{ transportMode: destination.transportMode, departureTime: destination.departureTime });
        return areaAssessment(area,destination,route,prices,budget);
      } catch { return areaAssessment(area,destination,null,prices,budget); }
      }));
      return {...assessments[0],withinLimits:assessments.every(a=>a.withinLimits),reasons:assessments.flatMap((a,i)=>a.reasons.map(reason=>destinations[i].label+': '+reason)),destinationJourneys:assessments.map((a,i)=>({label:destinations[i].label,minutes:a.minutes,mode:destinations[i].transportMode}))};
    });
    results.sort((a,b) => Number(b.withinLimits)-Number(a.withinLimits) || (a.minutes ?? Infinity)-(b.minutes ?? Infinity));
    return Response.json({ areas: results, centerLabel: named[0]?.name ?? "the selected point", lookupFailures });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Nearby areas unavailable" }, { status: 502 });
  }
}
