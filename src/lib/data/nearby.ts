import type { Coordinates, DestinationConstraint, LocationCell, TransportMode } from "@/src/types/domain";
import { distanceKm, samplingRadiusKm, withinTravelTime } from "@/src/lib/routing/commute";

export interface NearbyArea extends Coordinates {
  id: string; name: string; address: string; minutes: number | null; distanceKm?: number;
  destinationJourneys?: {label:string;minutes:number|null;mode:TransportMode}[];
  selectedMode?: TransportMode; withinLimits: boolean; reasons: string[];
  typicalHousePrice?: number; priceLabel?: string; withinBudget?: boolean;
}
export type NamedArea = Pick<NearbyArea, "id" | "name" | "address" | "latitude" | "longitude">;
export function discoveryPoints(center: Coordinates, radius: number): Coordinates[] {
  const points = [center];
  for (const fraction of [0.2, 0.5, 0.85]) for (let index = 0; index < 8; index++) {
    const bearing = index / 8 * Math.PI * 2, angle = radius * fraction / 6371;
    const lat = center.latitude * Math.PI / 180, lon = center.longitude * Math.PI / 180;
    const nextLat = Math.asin(Math.sin(lat) * Math.cos(angle) + Math.cos(lat) * Math.sin(angle) * Math.cos(bearing));
    const nextLon = lon + Math.atan2(Math.sin(bearing) * Math.sin(angle) * Math.cos(lat), Math.cos(angle) - Math.sin(lat) * Math.sin(nextLat));
    points.push({ latitude: nextLat * 180 / Math.PI, longitude: ((nextLon * 180 / Math.PI + 540) % 360) - 180 });
  }
  return points;
}
export function discoveryRadius(destination: DestinationConstraint, clicked: boolean) {
  return Math.max(1, Math.min(clicked ? 12 : 100, destination.maximumDistanceKm ?? samplingRadiusKm(destination), samplingRadiusKm(destination)));
}
export function uniqueNearbyAreas(areas: NamedArea[], center: Coordinates, radius: number) {
  const unique = new Map<string, NamedArea>();
  for (const area of [...areas].sort((a,b) => distanceKm(a,center)-distanceKm(b,center))) {
    if (distanceKm(area,center) > radius) continue;
    const key = area.name.toLocaleLowerCase("en-GB");
    if (!unique.has(key)) unique.set(key, area);
  }
  return [...unique.values()];
}
export function areaAssessment(area: NamedArea, destination: DestinationConstraint, route: { minutes:number; distanceKm?:number; selectedMode?:TransportMode } | null, prices: LocationCell[], budget?: number): NearbyArea {
  // An exact name AND local position must match. Never transplant a distant area's price.
  const price = prices.find(price => price.town.toLowerCase() === area.name.toLowerCase() && distanceKm(price,area) < 10);
  const reasons: string[] = [];
  if (!route) reasons.push("Journey unavailable");
  else {
    if (!withinTravelTime(route.minutes,destination)) reasons.push("Outside your travel-time range");
    if (route.distanceKm !== undefined && (route.distanceKm < (destination.minimumDistanceKm ?? 0) || route.distanceKm > (destination.maximumDistanceKm ?? Infinity))) reasons.push("Outside your distance range");
  }
  return { ...area, minutes: route?.minutes ?? null, distanceKm: route?.distanceKm, selectedMode: route?.selectedMode,
    withinLimits: reasons.length === 0, reasons, typicalHousePrice: price?.typicalHousePrice,
    priceLabel: price ? `${price.town} historical area average` : undefined,
    withinBudget: price && budget ? price.typicalHousePrice <= budget : undefined };
}
