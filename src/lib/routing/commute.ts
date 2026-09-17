import { cellToBoundary, cellToChildren, cellToLatLng, getResolution, latLngToCell, polygonToCells } from "h3-js";
import type { FeatureCollection, Polygon } from "geojson";
import type { Coordinates, DestinationConstraint, JourneyStep, TransportMode } from "@/src/types/domain";

export const COMMUTE_STOPS = [
  { minutes: 0, colour: "#16856b" }, { minutes: 15, colour: "#80bf70" },
  { minutes: 30, colour: "#efce62" }, { minutes: 45, colour: "#ee9456" },
  { minutes: 60, colour: "#cb4b56" },
] as const;
export type CommuteSample = { id: string; minutes: number | null; itinerary?: JourneyStep[]; selectedMode?: TransportMode };
export type CommuteProperties = { id: string; minutes: number | null };

export function commuteLimits(destination: DestinationConstraint) {
  return { minimum: destination.minimumMinutes ?? 0, maximum: destination.maximumMinutes ?? destination.preferredMinutes ?? 60 };
}
export function withinTravelTime(minutes: number | null | undefined, destination: DestinationConstraint) {
  const { minimum, maximum } = commuteLimits(destination);
  return minutes != null && Number.isFinite(minutes) && minutes >= minimum && minutes <= maximum;
}
export function commuteColour(minutes: number | null, maximum = 60): string {
  if (minutes === null || !Number.isFinite(minutes)) return "#aab5ae";
  const scaled = Math.max(0, Math.min(60, minutes / Math.max(1, maximum) * 60));
  const index = Math.min(3, Math.floor(scaled / 15));
  const start = COMMUTE_STOPS[index], end = COMMUTE_STOPS[index + 1];
  const fraction = (scaled - start.minutes) / 15;
  return `#${[1, 3, 5].map(offset => {
    const a = parseInt(start.colour.slice(offset, offset + 2), 16);
    const b = parseInt(end.colour.slice(offset, offset + 2), 16);
    return Math.round(a + (b - a) * fraction).toString(16).padStart(2, "0");
  }).join("")}`;
}

export function sampleOrigin(id: string) {
  const [latitude, longitude] = cellToLatLng(id);
  return { latitude, longitude };
}
export function distanceKm(a: Coordinates, b: Coordinates) {
  const radians = Math.PI / 180;
  const sinLat = Math.sin((b.latitude - a.latitude) * radians / 2);
  const sinLon = Math.sin((b.longitude - a.longitude) * radians / 2);
  return 12742 * Math.asin(Math.min(1, Math.sqrt(sinLat ** 2 + Math.cos(a.latitude * radians) * Math.cos(b.latitude * radians) * sinLon ** 2)));
}

// This is only a generous sampling envelope, never a travel-time estimate.
// Actual routes decide which cells are shown. No administrative boundaries enter here.
export function samplingRadiusKm(destination: DestinationConstraint) {
  const speed = { drive: 115, transit: 180, mixed: 180, any: 180, cycle: 40, walk: 8 }[destination.transportMode];
  return Math.max(2, Math.min(600, commuteLimits(destination).maximum * speed / 60 + 3));
}
function pointAt(origin: Coordinates, distance: number, bearing: number): [number, number] {
  const lat = origin.latitude * Math.PI / 180, lon = origin.longitude * Math.PI / 180;
  const angle = distance / 6371;
  const latitude = Math.asin(Math.sin(lat) * Math.cos(angle) + Math.cos(lat) * Math.sin(angle) * Math.cos(bearing));
  const longitude = lon + Math.atan2(Math.sin(bearing) * Math.sin(angle) * Math.cos(lat), Math.cos(angle) - Math.sin(lat) * Math.sin(latitude));
  return [((longitude * 180 / Math.PI + 540) % 360) - 180, latitude * 180 / Math.PI];
}

function buildCommuteGrid(destination: DestinationConstraint): FeatureCollection<Polygon, CommuteProperties> {
  const radius = samplingRadiusKm(destination);
  const ring = Array.from({ length: 72 }, (_, index) => pointAt(destination, radius, index / 72 * Math.PI * 2));
  // Choose resolution before filling to avoid creating millions of fine cells.
  const approximateArea = Math.PI * radius * radius;
  const cellAreas: Record<number, number> = { 3: 12393, 4: 1770, 5: 253, 6: 36.1, 7: 5.16, 8: 0.737, 9: 0.105 };
  let resolution = 9;
  while (resolution > 3 && approximateArea / cellAreas[resolution] > 280) resolution--;
  let ids = polygonToCells([ring], resolution, true);
  while (ids.length > 350 && resolution > 3) ids = polygonToCells([ring], --resolution, true);
  const cells = new Set(ids);
  cells.add(latLngToCell(destination.latitude, destination.longitude, resolution));
  const transit = destination.transportMode === "transit" || destination.transportMode === "mixed" || destination.transportMode === "any";
  if (transit) {
    // Refine recursively: a huge regional cell can otherwise miss access to a stop.
    while (cells.size + 6 <= 1000) {
      const candidate = [...cells].filter(id => {
        const km = distanceKm(sampleOrigin(id), destination);
        const target = km < 25 ? 7 : km < 65 ? 6 : 5;
        return getResolution(id) < target;
      }).sort((a,b) => distanceKm(sampleOrigin(a),destination)-distanceKm(sampleOrigin(b),destination))[0];
      if (!candidate) break;
      cells.delete(candidate);
      cellToChildren(candidate, getResolution(candidate)+1).forEach(child => cells.add(child));
    }
  } else {
    for (const id of [...cells].sort((a,b)=>distanceKm(sampleOrigin(a),destination)-distanceKm(sampleOrigin(b),destination))) {
      if (cells.size+6>700 || distanceKm(sampleOrigin(id),destination)>radius*0.65) break;
      cells.delete(id); cellToChildren(id,resolution+1).forEach(child=>cells.add(child));
    }
  }
  return { type: "FeatureCollection", features: [...cells]
    .sort((a, b) => distanceKm(sampleOrigin(a), destination) - distanceKm(sampleOrigin(b), destination))
    .map(id => ({ type: "Feature", properties: { id, minutes: null }, geometry: { type: "Polygon", coordinates: [cellToBoundary(id, true)] } })) };
}

export function gridCellAt(grid: FeatureCollection<Polygon, CommuteProperties>, point: Coordinates) {
  const resolutions = new Set(grid.features.map(feature => getResolution(feature.properties.id)));
  const candidates = new Set([...resolutions].map(resolution => latLngToCell(point.latitude, point.longitude, resolution)));
  return grid.features.find(feature => candidates.has(feature.properties.id));
}

const gridCache = new Map<string, ReturnType<typeof buildCommuteGrid>>();
export function commuteGrid(destination: DestinationConstraint) {
  const key = JSON.stringify([destination.latitude, destination.longitude, destination.transportMode, commuteLimits(destination).maximum]);
  const existing = gridCache.get(key);
  if (existing) return existing;
  const grid = buildCommuteGrid(destination);
  if (gridCache.size >= 20) gridCache.delete(gridCache.keys().next().value!);
  gridCache.set(key, grid);
  return grid;
}