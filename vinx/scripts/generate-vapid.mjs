#!/usr/bin/env node
// Generates a VAPID key pair for Web Push. No dependencies:  node scripts/generate-vapid.mjs
import crypto from 'node:crypto';

const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const b64u = (b) => Buffer.from(b).toString('base64url');

const publicKey = b64u(Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]));

console.log(`
Add these two as Supabase Edge Function secrets:
  VAPID_PUBLIC_KEY=${publicKey}
  VAPID_PRIVATE_KEY=${jwk.d}
  VAPID_SUBJECT=mailto:you@yourdomain.com

Add this to your frontend env (it is public, safe to expose):
  VITE_VAPID_PUBLIC_KEY=${publicKey}

Keep VAPID_PRIVATE_KEY secret. If you ever rotate the keys, users re-subscribe automatically the next time they open the app.
`);
