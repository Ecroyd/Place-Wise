import { describe, expect, it, vi } from "vitest";
import { cellToChildren, getResolution, latLngToCell } from "h3-js";
import { commuteGrid, sampleOrigin } from "../src/lib/routing/commute";
import { allowedCommuteCell, commuteDetailGrid, MAX_DETAIL_CELLS } from "../src/lib/routing/detail";
import type { DestinationConstraint } from "../src/types/domain";
const { route } = vi.hoisted(() => ({ route: vi.fn() }));
vi.mock("../src/lib/routing/provider", () => ({ getLiveRoutingProvider: () => ({ getTravelTime: route }) }));
import { POST } from "../app/api/commute/route";

const destination: DestinationConstraint = { id: "detail", label: "Work", purpose: "work", latitude: 53.48, longitude: -2.24, journeysPerWeek: 5, transportMode: "drive", weight: 100, hardMaximum: false, maximumMinutes: 35 };
const grid = commuteGrid(destination);
const allowed = new Set(grid.features.map(feature => feature.properties.id));
const view = (size: number) => ({ west: destination.longitude - size, east: destination.longitude + size, south: destination.latitude - size, north: destination.latitude + size });
const request = (id: string) => new Request("http://localhost/api/commute", { method: "POST", body: JSON.stringify({ destination, cells: [id] }) });

describe("zoom-based commute detail", () => {
  it("adds no detail at regional zoom and bounds detail for wide views", () => {
    expect(commuteDetailGrid(grid, view(.1), 11).features).toHaveLength(0);
    expect(commuteDetailGrid(grid, view(10), 18).features).toHaveLength(0);
    for (const size of [.2, .08, .02, .005]) {
      expect(commuteDetailGrid(grid, view(size), 18).features.length).toBeLessThanOrEqual(MAX_DETAIL_CELLS);
    }
  });
  it("produces progressively finer independently sampled cells as the view narrows", () => {
    let previousResolution = 0;
    for (const [zoom, size] of [[12, .04], [14, .01], [16, .0025], [18, .000625]]) {
      const detail = commuteDetailGrid(grid, view(size), zoom);
      expect(detail.features.length).toBeGreaterThan(0);
      const resolution = getResolution(detail.features[0].properties.id);
      expect(resolution).toBeGreaterThan(previousResolution);
      previousResolution = resolution;
      for (const feature of detail.features) {
        expect(allowedCommuteCell(feature.properties.id, allowed)).toBe(true);
        const centre = sampleOrigin(feature.properties.id);
        expect(centre.latitude).toBeGreaterThanOrEqual(view(size).south);
        expect(centre.latitude).toBeLessThanOrEqual(view(size).north);
      }
    }
  });
  it("rejects remote cells and excessive resolution", async () => {
    const fine = cellToChildren(grid.features[0].properties.id, 12)[0];
    expect((await POST(request(fine))).status).toBe(400);
    expect((await POST(request(latLngToCell(51.5, -.1, 10)))).status).toBe(400);
    expect(commuteDetailGrid(grid, { west: -.11, east: -.09, south: 51.49, north: 51.51 }, 16).features).toHaveLength(0);
  });
  it("routes a child's own centre, caches it, and never copies a parent's time", async () => {
    route.mockReset().mockResolvedValue({ minutes: 99 });
    const id = commuteDetailGrid(grid, view(.001), 16).features[0].properties.id;
    const first = await (await POST(request(id))).json();
    expect(first.samples).toEqual([{ id, minutes: 99 }]);
    expect(route).toHaveBeenCalledWith(sampleOrigin(id), destination, { transportMode: "drive" });
    await POST(request(id));
    expect(route).toHaveBeenCalledTimes(1);
  });
});
