import {paidRequestBudget, type GoogleSku} from '@/src/lib/server/budget';
import type { Coordinates } from "@/src/types/domain";
import type { JourneyStep } from "@/src/types/domain";
import type { RoutingOptions, RoutingProvider, TravelTimeResult } from "./provider";
import { settleLimited } from "./batch";

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

type SingleMode = Exclude<RoutingOptions["transportMode"], "any">;
type Settled = PromiseSettledResult<TravelTimeResult>;
type MatrixElement = { originIndex?: number; destinationIndex?: number; condition?: string; duration?: string; distanceMeters?: number; status?: { code?: number; message?: string } };
const GOOGLE_MODE = { drive: "DRIVE", transit: "TRANSIT", walk: "WALK", cycle: "BICYCLE", mixed: "TRANSIT" } as const;
const SELECTED_MODE = { DRIVE: "drive", BICYCLE: "cycle", WALK: "walk", TRANSIT: "transit" } as const;
const STEP_LABEL = { drive: "Drive", cycle: "Cycle", walk: "Walk", transit: "Public transport" } as const;
const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";
const MATRIX_URL = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const MATRIX_CHUNK = 25;

export function straightLineKm(a: Coordinates, b: Coordinates) {
  return Math.hypot((a.latitude - b.latitude) * 111, (a.longitude - b.longitude) * 111 * Math.cos(a.latitude * Math.PI / 180));
}
// A real route is never shorter than the straight line, and Google never walks or
// cycles faster than these ceilings, so this is a strict lower bound on its answer.
export function fastestPossibleMinutes(km: number, mode: "walk" | "cycle") {
  return km / (mode === "walk" ? 7 : 30) * 60;
}
// Traffic-aware routing bills at Google's higher Pro tier. Only pay for it when
// the user chose a departure time; otherwise use the cheaper typical-traffic route.
// Traffic-aware driving is billed at Google's Pro tier; everything else here is Essentials.
export function googleSku(api: "routes" | "matrix", body: Record<string, unknown>): GoogleSku {
  const pro = body.routingPreference === "TRAFFIC_AWARE" || body.routingPreference === "TRAFFIC_AWARE_OPTIMAL";
  return pro ? `${api}-pro` : api;
}
export function drivePreferences(options: RoutingOptions): Record<string, unknown> {
  if (!options.departureTime) return { routingPreference: "TRAFFIC_UNAWARE" };
  const departure = Date.parse(options.departureTime);
  return Number.isFinite(departure) && departure > Date.now() + 60000
    ? { routingPreference: "TRAFFIC_AWARE", departureTime: options.departureTime }
    : { routingPreference: "TRAFFIC_AWARE" };
}
const ok = (value: TravelTimeResult): Settled => ({ status: "fulfilled", value });
const failed = (reason: unknown): Settled => ({ status: "rejected", reason });
const latLng = (point: Coordinates) => ({ latLng: { latitude: point.latitude, longitude: point.longitude } });

export function fastest(results: Settled[]): Settled {
  const available = results.flatMap(result => result.status === "fulfilled" ? [result.value] : []);
  if (available.length) return ok(available.sort((a, b) => a.minutes - b.minutes)[0]);
  const error = results.find(result => result.status === "rejected" && result.reason?.name !== "NoRouteError");
  return failed(error?.status === "rejected" ? error.reason : new NoRouteError());
}

export class GoogleRoutesProvider implements RoutingProvider {
  constructor(private apiKey = process.env.GOOGLE_MAPS_API_KEY) { if (!apiKey) throw new RoutingUnavailableError("Google routing is not configured"); }

  async getTravelTime(origin: Coordinates, destination: Coordinates, options: RoutingOptions): Promise<TravelTimeResult> {
    const [result] = await this.getTravelTimes([origin], destination, options);
    if (result.status === "rejected") throw result.reason;
    return result.value;
  }

  async getTravelTimes(origins: Coordinates[], destination: Coordinates, options: RoutingOptions): Promise<Settled[]> {
    if (options.transportMode === "any") return this.anyMode(origins, destination, options);
    return this.byMode(origins, destination, { ...options, transportMode: options.transportMode });
  }

  async getTravelTimeMatrix(origins: Coordinates[], destinations: Coordinates[], options: RoutingOptions) {
    return Promise.all(destinations.map(async destination => (await this.getTravelTimes(origins, destination, options))
      .map(result => { if (result.status === "rejected") throw result.reason; return result.value; })))
      .then(columns => origins.map((_, i) => columns.map(column => column[i])));
  }
  async getIsochrone(): Promise<Coordinates[]> { throw new Error("Google Routes does not provide isochrones"); }

  // "Any" picks the fastest mode. Walking and cycling are only requested where
  // their lower bound could still beat the best driving or transit journey.
  private async anyMode(origins: Coordinates[], destination: Coordinates, options: RoutingOptions): Promise<Settled[]> {
    const departureTime = options.departureTime ?? new Date().toISOString();
    const [drive, transit] = await Promise.all([
      this.byMode(origins, destination, { ...options, transportMode: "drive" }),
      this.byMode(origins, destination, { ...options, departureTime, transportMode: "transit" }, false),
    ]);
    const best = origins.map((_, i) => fastest([drive[i], transit[i]]));
    const active = (mode: "walk" | "cycle") => origins.flatMap((origin, i) => {
      const current = best[i];
      return current.status === "rejected" || fastestPossibleMinutes(straightLineKm(origin, destination), mode) < current.value.minutes ? [i] : [];
    });
    const extra = async (mode: "walk" | "cycle") => {
      const indices = active(mode);
      const routed = await this.byMode(indices.map(i => origins[i]), destination, { ...options, departureTime, transportMode: mode });
      const byIndex = new Map(indices.map((index, position) => [index, routed[position]]));
      return origins.map((_, i) => byIndex.get(i));
    };
    const [cycle, walk] = await Promise.all([extra("cycle"), extra("walk")]);
    return origins.map((_, i) => fastest([drive[i], transit[i], cycle[i], walk[i]].filter((result): result is Settled => !!result)));
  }

  private async byMode(origins: Coordinates[], destination: Coordinates, options: RoutingOptions & { transportMode: SingleMode }, walkFallback = true): Promise<Settled[]> {
    if (!origins.length) return [];
    const transit = options.transportMode === "transit" || options.transportMode === "mixed";
    if (transit || origins.length === 1) {
      return settleLimited(origins, origin => this.route(origin, destination, options, walkFallback));
    }
    const results: Settled[] = [];
    for (let start = 0; start < origins.length; start += MATRIX_CHUNK) results.push(...await this.matrix(origins.slice(start, start + MATRIX_CHUNK), destination, options));
    return results;
  }

  private async matrix(origins: Coordinates[], destination: Coordinates, options: RoutingOptions & { transportMode: SingleMode }): Promise<Settled[]> {
    const travelMode = GOOGLE_MODE[options.transportMode];
    const selectedMode = SELECTED_MODE[travelMode];
    const body: Record<string, unknown> = { origins: origins.map(origin => ({ waypoint: { location: latLng(origin) } })),
      destinations: [{ waypoint: { location: latLng(destination) } }], travelMode, ...(travelMode === "DRIVE" ? drivePreferences(options) : {}) };
    let elements: MatrixElement[];
    try {
      await paidRequestBudget(googleSku("matrix", body), origins.length);
      const response = await fetch(MATRIX_URL, { method: "POST", signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey!, "X-Goog-FieldMask": "originIndex,destinationIndex,condition,duration,distanceMeters,status" },
        body: JSON.stringify(body) });
      if (!response.ok) throw new RoutingUnavailableError(`Journey planner unavailable (${response.status}). Please check the routing configuration or try again.`);
      elements = await response.json() as MatrixElement[];
    } catch (error) { return origins.map(() => failed(error)); }
    return origins.map((_, index) => {
      const element = elements.find(item => (item.originIndex ?? 0) === index);
      const total = seconds(element?.duration);
      if (!element || element.condition !== "ROUTE_EXISTS" || !Number.isFinite(total) || total <= 0) return failed(new NoRouteError());
      const minutes = Math.max(1, Math.ceil(total / 60));
      return ok({ minutes, distanceKm: element.distanceMeters === undefined ? undefined : Math.round(element.distanceMeters / 100) / 10,
        source: "google-route-matrix-v1", selectedMode, itinerary: [{ mode: STEP_LABEL[selectedMode], minutes }] });
    });
  }

  private async route(origin: Coordinates, destination: Coordinates, options: RoutingOptions & { transportMode: SingleMode }, walkFallback: boolean): Promise<TravelTimeResult> {
    const transit = options.transportMode === "transit" || options.transportMode === "mixed";
    const departureTime = transit ? options.departureTime ?? new Date().toISOString() : undefined;
    const requestRoutes = async (travelMode: "DRIVE" | "TRANSIT" | "WALK" | "BICYCLE"): Promise<TravelTimeResult[]> => {
      const body: Record<string, unknown> = { origin: { location: latLng(origin) }, destination: { location: latLng(destination) }, travelMode, languageCode: "en-GB", units: "METRIC" };
      if (travelMode === "DRIVE") Object.assign(body, drivePreferences(options));
      if (travelMode === "TRANSIT") {
        body.departureTime = departureTime;
        body.computeAlternativeRoutes = true;
        // Leaving transitPreferences unrestricted permits buses, rail, trams and transfers.
      }
      await paidRequestBudget(googleSku("routes", body));
      const response = await fetch(ROUTES_URL, {
        method: "POST", signal: AbortSignal.timeout(20000),
        headers: { "Content-Type": "application/json", "X-Goog-Api-Key": this.apiKey!,
          "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.legs.steps.travelMode,routes.legs.steps.staticDuration,routes.legs.steps.transitDetails" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new RoutingUnavailableError(`Journey planner unavailable (${response.status}). Please check the routing configuration or try again.`);
      const payload = await response.json() as { routes?: GoogleRoute[] };
      const selectedMode = SELECTED_MODE[travelMode];
      return (payload.routes ?? []).filter(route => route.duration).map(route => {
        const result = routeResult(route, travelMode === "TRANSIT" ? departureTime : undefined);
        return { ...result, selectedMode, itinerary: result.itinerary?.length ? result.itinerary : [{ mode: STEP_LABEL[selectedMode], minutes: result.minutes }] };
      });
    };
    const routes = (await requestRoutes(GOOGLE_MODE[options.transportMode])).sort((a, b) => a.minutes - b.minutes);
    // A short door-to-door walk can beat waiting for a bus; route it, never estimate it.
    // Skip the call when even the fastest possible walk cannot beat the best transit journey.
    const km = straightLineKm(origin, destination);
    if (transit && walkFallback && km <= 4 && (!routes.length || fastestPossibleMinutes(km, "walk") < routes[0].minutes)) {
      try { routes.push(...await requestRoutes("WALK")); } catch (error) { if (!routes.length) throw error; }
    }
    if (!routes.length) throw new NoRouteError();
    return routes.sort((a, b) => a.minutes - b.minutes)[0];
  }
}
