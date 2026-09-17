import { describe, expect, it, vi, beforeEach } from "vitest";
import { latLngToCell } from "h3-js";
import type { DestinationConstraint } from "../src/types/domain";
import { commuteGrid, sampleOrigin, withinTravelTime, commuteColour, distanceKm, samplingRadiusKm, gridCellAt } from "../src/lib/routing/commute";
const { route } = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("../src/lib/routing/provider", () => ({ getLiveRoutingProvider: () => ({ getTravelTime: route }) }));
import { POST } from "../app/api/commute/route";
const destination: DestinationConstraint = { id: "work", label: "Work", purpose: "work", latitude: 53.55, longitude: -2.2, journeysPerWeek: 5, transportMode: "drive", weight: 100, hardMaximum: false, maximumMinutes: 35 };
const request = (body: unknown) => new Request("http://localhost/api/commute", { method: "POST", body: JSON.stringify(body) });

describe("travel-time areas", () => {
  beforeEach(() => { route.mockReset(); });
  it("samples across borough boundaries and supports destinations outside Manchester", () => {
    const grid = commuteGrid(destination);
    expect(grid.features.length).toBeGreaterThan(50);
    expect(grid.features.length).toBeLessThanOrEqual(700);
    expect(grid.features.some(feature => sampleOrigin(feature.properties.id).latitude > 53.75)).toBe(true);
    const london = { ...destination, latitude: 51.5, longitude: -0.1 };
    const londonGrid = commuteGrid(london);
    expect(gridCellAt(londonGrid, london)).toBeDefined();
    expect(londonGrid.features.every(feature => distanceKm(sampleOrigin(feature.properties.id), london) < samplingRadiusKm(london) + 15)).toBe(true);
    for (const feature of grid.features) {
      const ring = feature.geometry.coordinates[0];
      expect(ring[0]).toEqual(ring.at(-1));
    }
  });
  it("changes coverage with travel time and transport mode", () => {
    expect(samplingRadiusKm({ ...destination, maximumMinutes: 60 })).toBeGreaterThan(samplingRadiusKm(destination));
    expect(samplingRadiusKm({ ...destination, transportMode: "walk" })).toBeLessThan(samplingRadiusKm(destination));
  });
  it("only shades measured routes in the selected range, irrespective of borough", () => {
    const range = { ...destination, minimumMinutes: 10 };
    expect(withinTravelTime(9, range)).toBe(false);
    expect(withinTravelTime(10, range)).toBe(true);
    expect(withinTravelTime(35, range)).toBe(true);
    expect(withinTravelTime(36, range)).toBe(false);
    expect(withinTravelTime(null, range)).toBe(false);
    expect(withinTravelTime(undefined, range)).toBe(false);
    expect(commuteColour(35, 35)).toBe("#cb4b56");
  });
  it("routes outside Manchester and caches separately by destination and travel mode", async () => {
    route.mockResolvedValue({ minutes: 17 });
    const london = { ...destination, latitude: 51.5, longitude: -0.1 };
    const cell = commuteGrid(london).features[0].properties.id;
    expect(await (await POST(request({ destination: london, cells: [cell] }))).json()).toEqual({ samples: [{ id: cell, minutes: 17 }] });
    expect(route).toHaveBeenCalledWith(sampleOrigin(cell), london, { transportMode: "drive" });
    await POST(request({ destination: london, cells: [cell] }));
    expect(route).toHaveBeenCalledTimes(1);
    const cycling = { ...london, transportMode: "cycle" as const };
    await POST(request({ destination: cycling, cells: [commuteGrid(cycling).features[0].properties.id] }));
    expect(route).toHaveBeenCalledTimes(2);
  });
  it("keeps failed routes unknown instead of inventing times", async () => {
    route.mockRejectedValue(new Error("No route"));
    const cell = commuteGrid(destination).features[0].properties.id;
    expect(await (await POST(request({ destination, cells: [cell] }))).json()).toEqual({ samples: [{ id: cell, minutes: null }] });
  });
  it("bounds batches and rejects cells outside the destination's sampling area", async () => {
    const cell = commuteGrid(destination).features[0].properties.id;
    expect((await POST(request({ destination, cells: Array(17).fill(cell) }))).status).toBe(400);
    expect((await POST(request({ destination, cells: [latLngToCell(51.5, -0.1, 7)] }))).status).toBe(400);
    expect(route).not.toHaveBeenCalled();
  });
});
