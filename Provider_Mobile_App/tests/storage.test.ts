import test from 'node:test';
import assert from 'node:assert/strict';
import { createChunkedStorage } from '../src/lib/secureStorage';

function fixture() {
  const items = new Map<string, string>();
  let fault: ((key: string) => boolean) | null = null;
  let generation = 0;
  const storage = createChunkedStorage({
    getItem: async key => items.get(key) ?? null,
    setItem: async (key, value) => { if (fault?.(key)) throw new Error('disk unavailable'); items.set(key, value); },
    removeItem: async key => { items.delete(key); },
  }, () => `generation-${++generation}`);
  return { items, storage, fail: (next: typeof fault) => { fault = next; } };
}
test('long Unicode sessions round-trip through small native storage values', async () => {
  const { storage, items } = fixture();
  const session = JSON.stringify({ token: 'x'.repeat(18000), name: 'Care 🧑🏽‍⚕️'.repeat(100) });
  await storage.setItem('session', session);
  assert.equal(await storage.getItem('session'), session);
  assert.ok([...items.values()].every(value => Buffer.byteLength(value) < 2000));
  await storage.removeItem('session');
  assert.equal(await storage.getItem('session'), null);
  assert.equal(items.size, 0);
});
test('failed chunk and manifest writes preserve the last committed session', async () => {
  for (const target of ['.generation-2.1', 'session']) {
    const f = fixture();
    await f.storage.setItem('session', 'original');
    f.fail(key => target === 'session' ? key === target : key.endsWith(target));
    await assert.rejects(f.storage.setItem('session', 'new'.repeat(2000)), /could not be saved/);
    assert.equal(await f.storage.getItem('session'), 'original');
    assert.equal(f.items.size, 2);
  }
});
test('concurrent writes and sign-out cannot resurrect a session', async () => {
  const { storage, items } = fixture();
  await Promise.all([storage.setItem('session', 'first'), storage.setItem('session', 'second'), storage.removeItem('session')]);
  assert.equal(await storage.getItem('session'), null);
  assert.equal(items.size, 0);
});
test('incomplete and malformed sessions fail closed and can be cleared', async () => {
  const f = fixture();
  await f.storage.setItem('session', 'token');
  f.items.delete('session.generation-1.0');
  await assert.rejects(f.storage.getItem('session'), /incomplete/);
  f.items.set('session', '{broken');
  await assert.rejects(f.storage.getItem('session'));
  await f.storage.removeItem('session');
  assert.equal(await f.storage.getItem('session'), null);
});
