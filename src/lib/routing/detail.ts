import { cellToBoundary, cellToParent, getResolution, polygonToCells } from "h3-js";
import type { FeatureCollection, Polygon } from "geojson";
import { distanceKm, sampleOrigin, type CommuteProperties } from "./commute";

export const MAX_DETAIL_CELLS = 256;
export const MAX_DETAIL_RESOLUTION = 11;
type Grid = FeatureCollection<Polygon, CommuteProperties>;
export type ViewBounds = { west: number; south: number; east: number; north: number };

export function baseCellFor(id: string, allowed: Set<string>) {
  for (let resolution = getResolution(id); resolution >= 0; resolution--) {
    const ancestor = cellToParent(id, resolution);
    if (allowed.has(ancestor)) return ancestor;
  }
}

export function allowedCommuteCell(id: string, allowed: Set<string>) {
  return getResolution(id) <= MAX_DETAIL_RESOLUTION && !!baseCellFor(id, allowed);
}

// Generate only the viewport, never every descendant of the regional grid.
// A hard cell cap also bounds route calls after each settled pan/zoom.
export function commuteDetailGrid(base: Grid, bounds: ViewBounds, zoom: number): Grid {
  const empty: Grid = { type: "FeatureCollection", features: [] };
  if (zoom < 12 || bounds.east <= bounds.west || bounds.north <= bounds.south) return empty;
  const centre = { latitude: (bounds.south + bounds.north) / 2, longitude: (bounds.west + bounds.east) / 2 };
  const width = distanceKm({ ...centre, longitude: bounds.west }, { ...centre, longitude: bounds.east });
  const height = distanceKm({ ...centre, latitude: bounds.south }, { ...centre, latitude: bounds.north });
  const areas: Record<number, number> = { 8: .737, 9: .105, 10: .015, 11: .00215 };
  let resolution = Math.min(MAX_DETAIL_RESOLUTION, 8 + Math.floor((zoom - 12) / 2));
  while (resolution >= 8 && width * height / areas[resolution] > MAX_DETAIL_CELLS) resolution--;
  const allowed = new Set(base.features.map(feature => feature.properties.id));
  const ring = [[bounds.west, bounds.south], [bounds.east, bounds.south], [bounds.east, bounds.north], [bounds.west, bounds.north], [bounds.west, bounds.south]];
  for (; resolution >= 8; resolution--) {
    const ids = polygonToCells([ring], resolution, true).filter(id => {
      const parent = baseCellFor(id, allowed);
      return parent && getResolution(parent) < resolution;
    });
    if (ids.length > MAX_DETAIL_CELLS) continue;
    return { type: "FeatureCollection", features: ids
      .sort((a, b) => distanceKm(sampleOrigin(a), centre) - distanceKm(sampleOrigin(b), centre))
      .map(id => ({ type: "Feature", properties: { id, minutes: null }, geometry: { type: "Polygon", coordinates: [cellToBoundary(id, true)] } })) };
  }
  return empty;
}
