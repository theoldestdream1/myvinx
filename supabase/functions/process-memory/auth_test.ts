import { authenticate } from '../_shared/auth.ts';

Deno.test('rejects an unauthenticated processing request', async () => {
  const caller = await authenticate(new Request('https://example.com'));
  if (caller !== null) throw new Error('Unauthenticated caller accepted');
});

Deno.test('rejects a short invalid worker secret without a user session', async () => {
  const caller = await authenticate(new Request('https://example.com', { headers: { 'x-worker-secret':'invalid' } }));
  if (caller !== null) throw new Error('Invalid worker caller accepted');
});

Deno.test('accepts only the configured worker secret as an internal caller', async () => {
  const previous = Deno.env.get('WORKER_SECRET');
  try {
    Deno.env.set('WORKER_SECRET','test-worker-secret-not-a-production-credential');
    const caller = await authenticate(new Request('https://example.com', { headers: { 'x-worker-secret':'test-worker-secret-not-a-production-credential' } }));
    if (caller?.kind !== 'service') throw new Error('Verified worker caller rejected');
  } finally {
    if (previous === undefined) Deno.env.delete('WORKER_SECRET'); else Deno.env.set('WORKER_SECRET',previous);
  }
});