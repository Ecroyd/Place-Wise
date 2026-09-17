import type { Coordinates } from "@/src/types/domain";
import type { JourneyStep } from "@/src/types/domain";
import type { RoutingOptions, RoutingProvider, TravelTimeResult } from "./provider";

type GoogleStep = { travelMode?: string; staticDuration?: string; transitDetails?: {
  stopDetails?: { departureStop?: { name?: string }; arrivalStop?: { name?: string }; departureTime?: string; arrivalTime?: string };
  transitLine?: { name?: string; nameShort?: string; vehicle?: { type?: string; name?: { text?: string } } };
} };
type GoogleRoute = { duration?: string; distanceMeters?: number; legs?: { steps?: GoogleStep[] }[] };
const seconds = (duration?: string) => duration ? Number(duration.replace(/s$/, "")) : 0;
const transitMode = (type?: string) => type === "BUS" || type === "INTERCITY_BUS" || type === "TROLLEYBUS" ? "Bus"
  : type === "TRAM" || type === "LIGHT_RAIL" ? "Tram" : type === "SUBWAY" || type === "METRO_RAIL" ? "Metro" : "Train";

export class RoutingUnavailableError extends Error {
  constructor(message: string) { super(message); this.name = "RoutingUnavailableError"; }
}
export class NoRouteError extends Error {
  constructor() { super("No journey is available for this point and departure time"); this.name = "NoRouteError"; }
}

export function routeResult(route: GoogleRoute, departureTime?: string): TravelTimeResult {
  const rawSteps = route.legs?.flatMap(leg => leg.steps ?? []) ?? [];
  const itinerary: JourneyStep[] = [];
  let elapsed = 0;
  const departure = departureTime ? Date.parse(departureTime) : NaN;
  for (const step of rawSteps) {
    const duration = seconds(step.staticDuration);
    const transit = step.transitDetails;
    if (transit) {
      const stop = transit.stopDetails;
      const leaves = Date.parse(stop?.departureTime ?? "");
      const arrives = Date.parse(stop?.arrivalTime ?? "");
      if (Number.isFinite(leaves) && Number.isFinite(departure)) {
        const wait = Math.max(0, (leaves - departure) / 1000 - elapsed);
        if (wait >= 30) itinerary.push({ mode: "Wait", minutes: Math.round(wait / 60), from: stop?.departureStop?.name });
        elapsed += wait;
      }
      const ride = Number.isFinite(leaves) && Number.isFinite(arrives) ? Math.max(0, (arrives - leaves) / 1000) : duration;
      itinerary.push({ mode: transitMode(transit.transitLine?.vehicle?.type), minutes: Math.round(ride / 60),
        line: transit.transitLine?.nameShort ?? transit.transitLine?.name,
        from: stop?.departureStop?.name, to: stop?.arrivalStop?.name });
      elapsed += ride;
    } else if (step.travelMode === "WALK" || step.travelMode === "WALKING") {
      const last = itinerary.at(-1);
      // Accumulate walking instructions in seconds before rounding below.
      if (last?.mode === "Walk") last.minutes += duration / 60;
      else itinerary.push({ mode: "Walk", minutes: duration / 60 });
      elapsed += duration;
    }
  }
  for (const step of itinerary) step.minutes = Math.round(step.minutes);
  const total = Math.max(seconds(route.duration), elapsed);
  if (!Number.isFinite(total) || total <= 0) throw new NoRouteError();
  return { minutes: Math.max(1, Math.ceil(total / 60)), distanceKm: route.distanceMeters === undefined ? undefined : Math.round(route.distanceMeters / 100) / 10,
    source: "google-routes-multimodal-v3", itinerary, departureTime };
}

export class GoogleRoutesProvider implements RoutingProvider {
  constructor(private apiKey = process.env.GOOGLE_MAPS_API_KEY) { if (!apiKey) throw new RoutingUnavailableError("Google routing is not configured"); }
  async getTravelTime(origin: Coordinates, destination: Coordinates, options: RoutingOptions): Promise<TravelTimeResult> {
    if (options.transportMode === "any") {
      const departureTime = options.departureTime ?? new Date().toISOString();
      const modes = ["drive", "transit", "cycle", "walk"] as const;
      const compared = await Promise.allSettled(modes.map(transportMode => this.getTravelTime(origin, destination, { ...options, departureTime, transportMode })));
      const available = compared.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
      if (!available.length) {
        const failed = compared.find(result => result.status === "rejected" && result.reason?.name !== "NoRouteError");
        if (failed?.status === "rejected") throw failed.reason;
        throw new NoRouteError();
      }
      return available.sort((a,b) => a.minutes - b.minutes)[0];
    }
    const transit = options.transportMode === "transit" || options.transportMode === "mixed";
    const mode = ({ drive: "DRIVE", transit: "TRANSIT", walk: "WALK", cycle: "BICYCLE", mixed: "TRANSIT" })[options.transportMode];
    const departureTime = transit ? options.departureTime ?? new Date().toISOString() : undefined;
    const requestRoutes = async (travelMode: string): Promise<TravelTimeResult[]> => {
      const body: Record<string, unknown> = { origin: { location: { latLng: origin } }, destination: { location: { latLng: destination } }, travelMode, languageCode: "en-GB", units: "METRIC" };
      // Avoid passing labels/preferences as coordinates when callers use domain objects.
      body.origin = { location: { latLng: { latitude: origin.latitude, longitude: origin.longitude } } };
      body.destination = { location: { latLng: { latitude: destination.latitude, longitude: destination.longitude } } };
      if (travelMode === "DRIVE") body.routingPreference = "TRAFFIC_AWARE";
      if (travelMode === "TRANSIT") {
        body.departureTime = departureTime;
        body.computeAlternativeRoutes = true;
        // Leaving transitPreferences unrestricted permits buses, rail, trams and transfers.
      }
      const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
        method: "POST", signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey!,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new RoutingUnavailableError(`Journey planner unavailable (${response.status}). Please check the routing configuration or try again.`);
      const payload = await response.json() as { routes?: GoogleRoute[] };
      return (payload.routes ?? []).filter(route => route.duration).map(route => {
        const result = routeResult(route, travelMode === "TRANSIT" ? departureTime : undefined);
        const selectedMode = travelMode === "DRIVE" ? "drive" : travelMode === "BICYCLE" ? "cycle" : travelMode === "WALK" ? "walk" : "transit";
        return { ...result, selectedMode, itinerary: result.itinerary?.length ? result.itinerary : [{ mode: selectedMode === "drive" ? "Drive" : selectedMode === "cycle" ? "Cycle" : selectedMode === "walk" ? "Walk" : "Public transport", minutes: result.minutes }] } as TravelTimeResult;
      });
    };
    const routes = await requestRoutes(mode);
    // A short door-to-door walk can beat waiting for a bus; route it, never estimate it.
    const straightKm = Math.hypot((origin.latitude - destination.latitude) * 111, (origin.longitude - destination.longitude) * 111 * Math.cos(origin.latitude * Math.PI / 180));
    if (transit && straightKm <= 4) {
      try { routes.push(...await requestRoutes("WALK")); } catch (error) { if (!routes.length) throw error; }
    }
    if (!routes.length) throw new NoRouteError();
    return routes.sort((a, b) => a.minutes - b.minutes)[0];
  }
  async getTravelTimeMatrix(origins: Coordinates[], destinations: Coordinates[], options: RoutingOptions) { return Promise.all(origins.map(origin => Promise.all(destinations.map(destination => this.getTravelTime(origin, destination, options))))); }
  async getIsochrone(): Promise<Coordinates[]> { throw new Error("Google Routes does not provide isochrones"); }
}
