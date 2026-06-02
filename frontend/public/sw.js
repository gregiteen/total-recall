/**
 * Total Recall — Service Worker
 *
 * Caching strategies:
 *   • App shell:      Pre-cached on install
 *   • /api/* GETs:    Stale-While-Revalidate
 *   • /api/memory writes (POST/PUT/PATCH/DELETE): Network-first + offline queue with Background Sync
 *   • Static assets:  Cache-first
 *   • Everything else: Network-first
 *
 * Vault-hash optimization:
 *   Stores the vault_hash from /api/vault/status responses. Before fetching
 *   memory data, the app can check if the cached hash still matches — if so,
 *   skip the fetch entirely (handled client-side via the hash endpoint).
 */

const CACHE_NAME = 'total-recall-v1';
const API_CACHE = 'total-recall-api-v1';

// Pre-cache app shell
const PRECACHE_URLS = [
  '/',
];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME && k !== API_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET for caching (but handle write queueing for /api/memory)
  if (event.request.method !== 'GET') {
    if (url.pathname.startsWith('/api/memory')) {
      event.respondWith(networkWithOfflineQueue(event.request));
    }
    return;
  }

  // API routes: stale-while-revalidate (with vault-hash tracking)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(staleWhileRevalidate(event.request));
    return;
  }

  // Static assets: cache-first
  if (url.pathname.match(/\.(js|css|svg|png|woff2?)$/)) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  // Everything else: network-first
  event.respondWith(networkFirst(event.request));
});

// ─── Stale-While-Revalidate ──────────────────────────────────────────────────

async function staleWhileRevalidate(request) {
  const cache = await caches.open(API_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());

        // Track vault_hash from /api/vault/status responses
        const url = new URL(request.url);
        if (
          url.pathname === '/api/vault/status' ||
          url.pathname === '/api/vault/hash'
        ) {
          response
            .clone()
            .json()
            .then((data) => {
              if (data.vault_hash !== undefined) {
                saveVaultHash(data.vault_hash);
              }
            })
            .catch(() => {});
        }
      }
      return response;
    })
    .catch(() => cached);

  return cached || fetchPromise;
}

// ─── Cache-First ──────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    cache.put(request, response.clone());
  }
  return response;
}

// ─── Network-First ────────────────────────────────────────────────────────────

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}

// ─── Network with Offline Queue ───────────────────────────────────────────────

async function networkWithOfflineQueue(request) {
  try {
    return await fetch(request);
  } catch {
    // Queue for background sync when back online
    const body = await request.clone().text();
    const queue = await getQueue();
    queue.push({
      url: request.url,
      method: request.method,
      headers: Object.fromEntries(request.headers),
      body,
      timestamp: Date.now(),
    });
    await saveQueue(queue);

    // Register for background sync
    if (self.registration.sync) {
      await self.registration.sync.register('sync-memory-writes');
    }

    return new Response(JSON.stringify({ queued: true, offline: true }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ─── Background Sync ──────────────────────────────────────────────────────────

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-memory-writes') {
    event.waitUntil(replayQueue());
  }
});

// ─── Vault Hash Tracking ──────────────────────────────────────────────────────

let _cachedVaultHash = null;

function saveVaultHash(hash) {
  _cachedVaultHash = hash;
  // Also persist to IndexedDB for cross-restart durability
  openDB()
    .then((db) => {
      const tx = db.transaction('meta', 'readwrite');
      tx.objectStore('meta').put({ key: 'vault_hash', value: hash });
    })
    .catch(() => {});
}

// Expose vault hash to clients via message API
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_VAULT_HASH') {
    // Return the cached vault hash so clients can skip fetches when stale
    const respond = (hash) => {
      event.ports?.[0]?.postMessage({ vault_hash: hash });
    };

    if (_cachedVaultHash !== null) {
      respond(_cachedVaultHash);
    } else {
      // Try loading from IndexedDB
      openDB()
        .then((db) => {
          const tx = db.transaction('meta', 'readonly');
          const req = tx.objectStore('meta').get('vault_hash');
          req.onsuccess = () => respond(req.result?.value || null);
          req.onerror = () => respond(null);
        })
        .catch(() => respond(null));
    }
  }
});

// ─── IndexedDB Helpers ────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('total-recall-sw', 2);
    req.onupgradeneeded = (event) => {
      const db = req.result;
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'timestamp' });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('queue', 'readonly');
    const store = tx.objectStore('queue');
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function saveQueue(items) {
  const db = await openDB();
  const tx = db.transaction('queue', 'readwrite');
  const store = tx.objectStore('queue');
  store.clear();
  for (const item of items) store.put(item);
}

async function replayQueue() {
  const queue = await getQueue();
  const failed = [];
  for (const item of queue) {
    try {
      await fetch(item.url, {
        method: item.method,
        headers: item.headers,
        body: item.body,
      });
    } catch {
      failed.push(item);
    }
  }
  await saveQueue(failed);
}
