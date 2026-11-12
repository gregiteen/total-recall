import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { memoryEventsHandler } from './memory-events.mjs';

function stream() {
  const req = new EventEmitter();
  const res = { head: null, chunks: [], writeHead(status, headers) { this.head = { status, headers }; }, write(chunk) { this.chunks.push(chunk); } };
  return { req, res };
}

describe('memory events stream', () => {
  it('sends only the subsystem of events that change the memory page', () => {
    const events = new EventEmitter();
    const { req, res } = stream();
    memoryEventsHandler(events)(req, res);
    expect(res.head).toEqual({ status: 200, headers: expect.objectContaining({ 'Content-Type': 'text/event-stream' }) });
    events.emit('log', { subsystem: 'rebuild', message: { vaultDir: '/private/path' }, level: 'info' });
    events.emit('log', { subsystem: 'server', message: 'unrelated' });
    events.emit('log', { subsystem: 'conflict-detector', message: 'secret-looking detail' });
    const data = res.chunks.filter(c => c.startsWith('data: '));
    expect(data).toEqual(['data: {"subsystem":"rebuild"}\n\n', 'data: {"subsystem":"conflict-detector"}\n\n']);
    expect(res.chunks.join('')).not.toContain('/private/path');
  });

  it('stops listening when the client goes away', () => {
    const events = new EventEmitter();
    const { req, res } = stream();
    memoryEventsHandler(events)(req, res);
    expect(events.listenerCount('log')).toBe(1);
    req.emit('close');
    expect(events.listenerCount('log')).toBe(0);
    events.emit('log', { subsystem: 'rebuild' });
    expect(res.chunks.filter(c => c.startsWith('data: '))).toEqual([]);
  });
});
