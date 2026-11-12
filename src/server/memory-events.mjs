/**
 * Live refresh for the memory page, on the dashboard's own port.
 *
 * The page listened to `/stream` on the dashboard origin, but the server
 * serves `/stream` only on the 127.0.0.1 monitor port, so the dashboard got
 * its HTML fallback and the live refresh never connected. This stream is
 * authenticated like the rest of the dashboard API and carries only the
 * subsystem name of the events that change what the page shows, never log
 * contents.
 */
export const MEMORY_EVENT_SUBSYSTEMS = new Set(['conflict-detector', 'rebuild', 'session-watcher']);
const HEARTBEAT_MS = 25000;

/** @param {import('node:events').EventEmitter} events Emits 'log' entries ({ subsystem, ... }). */
export function memoryEventsHandler(events, { heartbeatMs = HEARTBEAT_MS } = {}) {
  return (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(': connected\n\n');
    const onLog = (entry) => {
      if (MEMORY_EVENT_SUBSYSTEMS.has(entry?.subsystem)) res.write(`data: ${JSON.stringify({ subsystem: entry.subsystem })}\n\n`);
    };
    events.on('log', onLog);
    // Comment lines keep proxies from closing an idle stream.
    const heartbeat = setInterval(() => res.write(': ping\n\n'), heartbeatMs);
    heartbeat.unref?.();
    req.on('close', () => {
      events.off('log', onLog);
      clearInterval(heartbeat);
    });
  };
}
