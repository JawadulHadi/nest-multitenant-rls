import { isUuid, signToken } from './token';

// Usage: TOKEN_SECRET=... npm run token -- <org-uuid> [ttlSeconds]
const [orgId, ttl] = process.argv.slice(2);
const secret = process.env.TOKEN_SECRET;
if (!secret || secret.length < 16) throw new Error('set TOKEN_SECRET (16+ characters)');
if (!orgId || !isUuid(orgId)) throw new Error('pass an organization uuid');
console.log(signToken(secret, orgId, ttl ? Number(ttl) : 3600));
