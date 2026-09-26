/** Direct, hash-pinned plugin exchange between Total Recall users. */
import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';

const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;
const SOURCE_PATH = /^\/api\/public\/plugins\/([a-z][a-z0-9-]{1,63})\/bundle$/;

function publicIpv4(address) {
  if (net.isIP(address) !== 4) return false;
  const [a, b, c] = address.split('.').map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

export function parsePublicPluginSource(source) {
  let url;
  try { url = new URL(source); } catch { return null; }
  const match = SOURCE_PATH.exec(url.pathname);
  if (!match) return null;
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.port) {
    throw new Error('Plugin share links require HTTPS with no credentials, query, or custom port');
  }
  const hash = /^#sha256=([a-f0-9]{64})$/.exec(url.hash);
  if (!hash) throw new Error('Plugin share link is missing its SHA-256 content pin');
  return { url, id: match[1], sha256: hash[1] };
}

export function publicPluginShareUrl(id, sha256, base = process.env.TR_PUBLIC_BASE_URL) {
  if (!base) return null;
  const origin = new URL(base);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/' || origin.port) {
    throw new Error('TR_PUBLIC_BASE_URL must be a public HTTPS origin without a path or custom port');
  }
  if (!/^[a-z][a-z0-9-]{1,63}$/.test(id) || !/^[a-f0-9]{64}$/.test(sha256)) throw new Error('Invalid plugin share link data');
  return `${origin.origin}/api/public/plugins/${id}/bundle#sha256=${sha256}`;
}

export async function fetchPublicBundle(source, deps = {}) {
  const parsed = parsePublicPluginSource(source);
  if (!parsed) throw new Error('Invalid Total Recall plugin share link');
  const host = parsed.url.hostname;
  const addresses = net.isIP(host) ? [{ address: host }] : await (deps.lookup || dns.lookup)(host, { all: true, family: 4 });
  const selected = addresses.find(({ address }) => publicIpv4(address));
  if (!selected || addresses.some(({ address }) => !publicIpv4(address))) {
    throw new Error('Plugin share host must resolve only to public IPv4 addresses');
  }
  const request = deps.request || https.request;
  const body = await new Promise((resolve, reject) => {
    const req = request(parsed.url, {
      method: 'GET',
      timeout: 20_000,
      lookup: (_host, _options, callback) => callback(null, selected.address, 4),
      headers: { Accept: 'application/json' }
    }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Plugin share returned HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      let size = 0;
      res.on('data', (chunk) => {
        size += chunk.length;
        if (size > MAX_RESPONSE_BYTES) {
          req.destroy(new Error('Plugin bundle exceeds the size limit'));
          return;
        }
        chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Plugin share timed out')));
    req.on('error', reject);
    req.end();
  });
  return { bundle: JSON.parse(body), id: parsed.id, sha256: parsed.sha256 };
}
