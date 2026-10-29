// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { enqueue, listQueued, removeQueued, flushQueue, isNetworkError, __resetQueueForTests } from '@/lib/captureQueue';

const item = (id: string, userId = 'u1') => ({ id, userId, content: `note ${id}`, source: 'manual' });
beforeEach(async () => { for (const i of await listQueued()) await removeQueued(i.id); __resetQueueForTests(); });

describe('offline outbox', () => {
  it('keeps items in order, per user, across reopening the database', async () => {
    await enqueue(item('a')); await enqueue(item('b')); await enqueue(item('x', 'u2'));
    __resetQueueForTests(); // simulates closing and reopening the app (IndexedDB persists)
    expect((await listQueued('u1')).map((i) => i.id)).toEqual(['a', 'b']);
    expect((await listQueued('u2')).map((i) => i.id)).toEqual(['x']);
  });
  // jsdom's Blob is not structured-cloneable by fake-indexeddb, so real Blob round-tripping can only be
  // verified in a browser; here we check the image field is carried through.
  it('carries the image field and its name', async () => {
    await enqueue({ ...item('img'), image: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }), imageName: 's.png' });
    const [got] = await listQueued('u1');
    expect(got.imageName).toBe('s.png');
    expect(got.image).toBeTruthy();
  });
  it('sends everything oldest first and empties the queue', async () => {
    await enqueue(item('a')); await enqueue(item('b'));
    const sent: string[] = [];
    const r = await flushQueue('u1', async (i) => { sent.push(i.id); });
    expect(sent).toEqual(['a', 'b']); expect(r).toEqual({ sent: 2, remaining: 0 });
  });
  it('stops at the first network error and keeps the rest', async () => {
    await enqueue(item('a')); await enqueue(item('b')); await enqueue(item('c'));
    const calls: string[] = [];
    const r = await flushQueue('u1', async (i) => { calls.push(i.id); if (i.id === 'b') throw new TypeError('Failed to fetch'); });
    expect(calls).toEqual(['a', 'b']); expect(r).toEqual({ sent: 1, remaining: 2 });
  });
  it('a server error on one item does not block the others, and a hopeless item is eventually dropped', async () => {
    await enqueue(item('bad')); await enqueue(item('good'));
    const send = async (i: { id: string }) => { if (i.id === 'bad') throw new Error('row violates policy'); };
    let r = await flushQueue('u1', send);
    expect(r).toEqual({ sent: 1, remaining: 1 });
    for (let n = 0; n < 8; n++) r = await flushQueue('u1', send);
    expect(r.remaining).toBe(0);
  });
  it('only one flush runs at a time', async () => {
    await enqueue(item('a'));
    const send = vi.fn(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await Promise.all([flushQueue('u1', send), flushQueue('u1', send)]);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('another user\'s items are never sent', async () => {
    await enqueue(item('mine')); await enqueue(item('theirs', 'u2'));
    const sent: string[] = [];
    await flushQueue('u1', async (i) => { sent.push(i.id); });
    expect(sent).toEqual(['mine']);
    expect((await listQueued('u2')).length).toBe(1);
  });
  it('refuses to grow without limit', async () => {
    for (let i = 0; i < 200; i++) await enqueue(item(`n${i}`));
    expect(await enqueue(item('one-too-many'))).toBe(false);
  });
  it('recognises network failures but not server errors', () => {
    expect(isNetworkError(new TypeError('Failed to fetch'))).toBe(true);
    expect(isNetworkError(new TypeError('Load failed'))).toBe(true);
    expect(isNetworkError({ message: 'NetworkError when attempting to fetch resource.' })).toBe(true);
    expect(isNetworkError({ message: 'new row violates row-level security policy', code: '42501' })).toBe(false);
    expect(isNetworkError(new Error('Image is too large'))).toBe(false);
  });
  it('treats being offline as a network error whatever the message', () => {
    const spy = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(isNetworkError(new Error('anything'))).toBe(true);
    spy.mockRestore();
  });
});
