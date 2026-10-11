import { createHmac, timingSafeEqual } from 'crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (s: string) => UUID.test(s);

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Minimal signed token carrying the tenant. In production use your IdP's JWT and read the org claim. */
export function signToken(secret: string, orgId: string, ttlSeconds = 3600, now = Date.now()): string {
  const payload = b64(JSON.stringify({ org: orgId, exp: Math.floor(now / 1000) + ttlSeconds }));
  return `${payload}.${b64(createHmac('sha256', secret).update(payload).digest())}`;
}

export function verifyToken(secret: string, token: string, now = Date.now()): string | null {
  const [payload, sig, ...rest] = token.split('.');
  if (!payload || !sig || rest.length) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const given = Buffer.from(sig, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { org, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (typeof org !== 'string' || !isUuid(org) || typeof exp !== 'number' || exp * 1000 < now) return null;
    return org;
  } catch {
    return null;
  }
}
