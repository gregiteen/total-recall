/** Resolve a safe application bind without silently exposing the service. */
export function resolveServerHost({ configuredHost, meshIp, allowPublicBind = false } = {}) {
  const requestedHost = configuredHost || meshIp || '127.0.0.1';
  const publicBindRequested = requestedHost === '0.0.0.0' || requestedHost === '::';
  const host = publicBindRequested && !allowPublicBind ? '127.0.0.1' : requestedHost;
  return {
    requestedHost,
    host,
    publicBindRefused: publicBindRequested && host !== requestedHost,
    usedLoopbackFallback: !configuredHost && !meshIp,
  };
}
