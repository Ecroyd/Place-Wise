import type {Coordinates} from '@/src/types/domain';
import type {RoutingOptions, RoutingProvider, TravelTimeResult} from './provider';

export async function settleLimited<T, R>(items: T[], action: (item: T) => Promise<R>, limit = 4): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({length: Math.min(limit, items.length)}, async () => {
    while (next < items.length) {
      const index = next++;
      try { results[index] = {status: 'fulfilled', value: await action(items[index])}; }
      catch (reason) { results[index] = {status: 'rejected', reason}; }
    }
  }));
  return results;
}

// Route many origins to one destination, batched when the provider supports it.
export function routeMany(provider: RoutingProvider, origins: Coordinates[], destination: Coordinates, options: RoutingOptions): Promise<PromiseSettledResult<TravelTimeResult>[]> {
  if (!origins.length) return Promise.resolve([]);
  if (provider.getTravelTimes) return provider.getTravelTimes(origins, destination, options);
  return settleLimited(origins, origin => provider.getTravelTime(origin, destination, options));
}
