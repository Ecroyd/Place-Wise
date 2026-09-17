import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleRoutesProvider, routeResult } from "../src/lib/routing/google";
import { CachedRoutingProvider, MemoryTravelTimeCache } from "../src/lib/routing/cache";
import { MockRoutingProvider, OsrmRoutingProvider } from "../src/lib/routing/provider";
const origin = { latitude: 53.3, longitude: -2.4 }, destination = { latitude: 53.55, longitude: -2.2 };
const departureTime = "2026-09-18T07:00:00Z";
const route = { duration: "1800s", distanceMeters: 10000, legs: [{ steps: [
  { travelMode: "WALK", staticDuration: "300s" },
  { travelMode: "TRANSIT", transitDetails: { stopDetails: { departureTime: "2026-09-18T07:10:00Z", arrivalTime: "2026-09-18T07:20:00Z", departureStop: { name: "First stop" }, arrivalStop: { name: "Station" } }, transitLine: { nameShort: "18", vehicle: { type: "BUS" } } } },
  { travelMode: "WALK", staticDuration: "120s" },
  { travelMode: "TRANSIT", transitDetails: { stopDetails: { departureTime: "2026-09-18T07:25:00Z", arrivalTime: "2026-09-18T07:40:00Z", departureStop: { name: "Station" }, arrivalStop: { name: "City" } }, transitLine: { name: "Northern", vehicle: { type: "HEAVY_RAIL" } } } },
  { travelMode: "WALK", staticDuration: "300s" },
] }] };
afterEach(() => { vi.unstubAllGlobals(); });
describe("multimodal public transport", () => {
  it("includes access walks, initial waiting, transfer waiting and final walking", () => {
    const result = routeResult(route, departureTime);
    expect(result.minutes).toBe(45);
    expect(result.itinerary?.map(step => step.mode)).toEqual(["Walk", "Wait", "Bus", "Walk", "Wait", "Train", "Walk"]);
    expect(result.itinerary?.filter(step => step.mode === "Wait").map(step => step.minutes)).toEqual([5, 3]);
    expect(result.itinerary?.[2].line).toBe("18");
  });
  it("requests unrestricted transfers and alternatives, choosing total door-to-door time", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ routes: [route, { duration: "600s", legs: [{ steps: [
      { travelMode: "TRANSIT", transitDetails: { stopDetails: { departureTime: "2026-09-18T08:00:00Z", arrivalTime: "2026-09-18T08:10:00Z" }, transitLine: { vehicle: { type: "BUS" } } } },
    ] }] }] }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await new GoogleRoutesProvider("test").getTravelTime(origin, destination, { transportMode: "transit", departureTime })).minutes).toBe(45);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ travelMode: "TRANSIT", computeAlternativeRoutes: true, departureTime });
    expect(body.transitPreferences).toBeUndefined();
    expect(body.routingPreference).toBeUndefined();
  });
  it("uses a real walking route nearby when transit has no suitable journey", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ routes: [] })).mockResolvedValueOnce(Response.json({ routes: [{ duration: "660s", legs: [{ steps: [{ travelMode: "WALK", staticDuration: "660s" }] }] }] }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await new GoogleRoutesProvider("test").getTravelTime(destination, { ...destination, latitude: 53.56 }, { transportMode: "transit", departureTime });
    expect(result.minutes).toBe(11);
    expect(result.itinerary?.[0].mode).toBe("Walk");
    expect(fetchMock.mock.calls.map(call => JSON.parse(call[1].body).travelMode)).toEqual(["TRANSIT", "WALK"]);
  });
  it("never substitutes a driving route for mixed public transport", async () => {
    await expect(new OsrmRoutingProvider().getTravelTime(origin, destination, { transportMode: "mixed" })).rejects.toThrow();
  });
  it("does not reuse the old month-long cache for scheduled public transport", async () => {
    const provider = new MockRoutingProvider();
    const spy = vi.spyOn(provider, "getTravelTime");
    const cached = new CachedRoutingProvider(provider, new MemoryTravelTimeCache());
    await cached.get("a", "b", origin, destination, "transit", "weekday", departureTime);
    await cached.get("a", "b", origin, destination, "transit", "weekday", "2026-09-18T08:00:00Z");
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy.mock.calls[1][2]).toMatchObject({ departureTime: "2026-09-18T08:00:00Z" });
  });
});
