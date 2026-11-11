export type KeyValueStore = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void>; removeItem(key: string): Promise<void> };

// Immutable generations keep the previous session readable if a write is interrupted.
// URI encoding makes chunks ASCII and keeps each native value below 2 KB.
export function createChunkedStorage(store: KeyValueStore, createId = () => `${Date.now()}-${Math.random().toString(36).slice(2)}`): KeyValueStore {
  let queue = Promise.resolve();
  const serial = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = queue.then(operation);
    queue = result.then(() => {}, () => {});
    return result;
  };
  type Manifest = { generation: string; count: number };
  async function manifest(key: string): Promise<Manifest | null> {
    const raw = await store.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Manifest;
    if (!/^[a-zA-Z0-9-]+$/.test(parsed.generation) || !Number.isInteger(parsed.count) || parsed.count < 1 || parsed.count > 256) throw new Error('Session storage is damaged. Please sign in again.');
    return parsed;
  }
  const partKey = (key: string, data: Manifest, i: number) => `${key}.${data.generation}.${i}`;
  async function cleanup(key: string, data: Manifest | null) {
    if (data) await Promise.all(Array.from({ length: data.count }, (_, i) => store.removeItem(partKey(key, data, i))));
  }
  return {
    getItem: key => serial(async () => {
      const data = await manifest(key);
      if (!data) return null;
      const chunks = await Promise.all(Array.from({ length: data.count }, (_, i) => store.getItem(partKey(key, data, i))));
      if (chunks.some(part => part === null)) throw new Error('Session storage is incomplete. Please sign in again.');
      return decodeURIComponent(chunks.join(''));
    }),
    setItem: (key, value) => serial(async () => {
      const previous = await manifest(key);
      const encoded = encodeURIComponent(value);
      const next = { generation: createId(), count: Math.max(1, Math.ceil(encoded.length / 1500)) };
      if (next.count > 256) throw new Error('Session storage exceeded its supported size.');
      try {
        for (let i = 0; i < next.count; i++) await store.setItem(partKey(key, next, i), encoded.slice(i * 1500, (i + 1) * 1500));
        await store.setItem(key, JSON.stringify(next));
      } catch (error) {
        await cleanup(key, next).catch(() => {});
        throw new Error('Session storage could not be saved. Please try again.', { cause: error });
      }
      // Old chunks cannot be restored after the manifest has switched.
      await cleanup(key, previous).catch(() => {});
    }),
    removeItem: key => serial(async () => {
      let previous: Manifest | null = null;
      try { previous = await manifest(key); } catch { /* Removing the manifest also recovers a damaged session. */ }
      await store.removeItem(key);
      await cleanup(key, previous);
    }),
  };
}
