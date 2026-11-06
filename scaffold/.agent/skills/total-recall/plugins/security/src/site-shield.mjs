const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_PATH = '/_security/csrf';
const PROOF = /^([0-9a-f]{24}):([1-6]):([0-9]{13}):([0-9a-f]{64}):([0-9]{1,16})$/;
const HEADERS = {
  'Content-Security-Policy': "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function respond(res, status, body) {
  res.statusCode = status;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// Caller supplies authenticated session identity and any trusted proxy/client boundary.
export function websiteMiddleware({
  origin, getSessionId, getClientId = req => req.socket?.remoteAddress, getBotSignals = () => ({}),
  maxRequests = 60, windowMs = 60_000, capacity = 10_000, difficulty = 3,
  createChallenge, verifyChallenge, csrfToken, verifyCsrf, botRisk, rateLimit,
}) {
  const trusted = new URL(origin);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(trusted.hostname);
  if (trusted.origin !== origin || (trusted.protocol !== 'https:' && !(loopback && trusted.protocol === 'http:'))) throw new Error('Configure a trusted HTTPS origin or loopback development origin');
  if (![getSessionId, getClientId, getBotSignals].every(value => typeof value === 'function')) throw new Error('Trusted session, client and bot resolvers must be functions');
  if (![maxRequests, windowMs, capacity, difficulty].every(value => Number.isSafeInteger(value) && value > 0) || difficulty > 6 || maxRequests > 10_000 || capacity > 100_000 || windowMs > 3_600_000) throw new Error('Invalid site shield limits');
  const buckets = new Map();
  const consumed = new Map();
  let nextSweep = 0;

  return async function shield(req, res, next) {
    for (const [name, value] of Object.entries(HEADERS)) res.setHeader(name, value);
    try {
      const client = await getClientId(req);
      if (typeof client !== 'string' || !client || client.length > 512) return respond(res, 400, { error: 'Client identity unavailable' });
      const now = Date.now();
      if (now >= nextSweep) {
        nextSweep = now + Math.min(windowMs, 1000);
        for (const [key, times] of buckets) if (times.at(-1) <= now - windowMs) buckets.delete(key);
        for (const [key, expiry] of consumed) if (expiry <= now) consumed.delete(key);
      }
      const rate = rateLimit(client, { maxRequests, windowMs, buckets, capacity });
      if (!rate.allowed) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil(rate.resetInMs / 1000))));
        return respond(res, 429, { error: 'Request rate exceeded' });
      }
      const url = new URL(req.url, origin);
      const csrfRoute = url.pathname === CSRF_PATH;
      if (!csrfRoute && SAFE_METHODS.has(req.method)) return next();
      if (req.headers['sec-fetch-site'] === 'cross-site' || (req.headers.origin && req.headers.origin !== origin)) {
        return respond(res, 403, { error: 'Untrusted request origin' });
      }
      const session = await getSessionId(req);
      if (session != null && (typeof session !== 'string' || !session)) return respond(res, 503, { error: 'Session verification unavailable' });
      if (csrfRoute) {
        if (req.method !== 'GET') return respond(res, 405, { error: 'Use GET to obtain a CSRF token' });
        if (!session) return respond(res, 401, { error: 'Authenticated session required' });
        return respond(res, 200, { token: await csrfToken(session) });
      }
      if (session && !(await verifyCsrf(req.headers['x-csrf-token'], session))) return respond(res, 403, { error: 'CSRF verification failed' });

      const signals = await getBotSignals(req);
      const verdict = await botRisk({ honeypot: signals.honeypot, elapsedMs: signals.elapsedMs });
      if (verdict.recommendation === 'block') return respond(res, 403, { error: 'Automated request blocked' });
      if (!session || verdict.recommendation === 'challenge') {
        const binding = JSON.stringify([client, session ?? null, req.method, req.url]);
        const proof = typeof req.headers['x-tr-proof'] === 'string' && PROOF.exec(req.headers['x-tr-proof']);
        if (!proof || !(await verifyChallenge(proof.slice(1), binding)).valid || consumed.has(proof[4])) {
          return respond(res, 403, { error: 'Proof of work required', challenge: await createChallenge(difficulty, binding) });
        }
        if (consumed.size >= capacity) return respond(res, 503, { error: 'Challenge replay protection at capacity' });
        consumed.set(proof[4], Number(proof[3]));
      }
    } catch {
      return respond(res, 503, { error: 'Website security verification unavailable' });
    }
    return next();
  };
}
