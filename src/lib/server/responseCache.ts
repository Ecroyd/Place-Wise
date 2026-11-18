import {getPlacewiseClient} from '@/src/lib/supabase/server';

// Server-only response cache shared across instances. Reuses the
// route_response_cache table (generic key/payload/expiry); expired rows are
// already purged by consume_request_budget.
export type CachedEntry<T> = {payload: T; expires: number};
const configured = () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY);

export async function readCached<T>(keys: string[]): Promise<Map<string, CachedEntry<T>>> {
  const found = new Map<string, CachedEntry<T>>();
  if (!keys.length || !configured()) return found;
  const {data} = await getPlacewiseClient().from('route_response_cache').select('key,payload,expires_at')
    .in('key', keys).gt('expires_at', new Date().toISOString());
  for (const row of data ?? []) found.set(row.key as string, {payload: row.payload as T, expires: Date.parse(row.expires_at as string)});
  return found;
}

export async function writeCached<T>(entries: {key: string; payload: T; expires: number}[]) {
  if (!entries.length || !configured()) return;
  await getPlacewiseClient().from('route_response_cache')
    .upsert(entries.map(entry => ({key: entry.key, payload: entry.payload, expires_at: new Date(entry.expires).toISOString()})));
}
