import { describe, it, expect, beforeEach } from 'vitest';
import {
  registerBoundHost,
  unregisterBoundHost,
  getBoundHosts,
  resetBoundHosts,
  isLoopbackHost,
  isReachableFromOtherDevices,
} from './bound-hosts.mjs';

describe('bound-hosts', () => {
  beforeEach(() => resetBoundHosts());

  it('records only what actually bound, in order, without duplicates', () => {
    registerBoundHost('100.64.0.6');
    registerBoundHost('127.0.0.1');
    registerBoundHost('100.64.0.6');
    expect(getBoundHosts()).toEqual(['100.64.0.6', '127.0.0.1']);
  });

  it('ignores empty values rather than recording a blank host', () => {
    registerBoundHost(null);
    registerBoundHost(undefined);
    registerBoundHost('');
    expect(getBoundHosts()).toEqual([]);
  });

  it('drops a host when its listener goes away', () => {
    registerBoundHost('100.64.0.6');
    unregisterBoundHost('100.64.0.6');
    expect(getBoundHosts()).toEqual([]);
  });

  it('treats every loopback spelling as loopback', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('100.64.0.6')).toBe(false);
  });

  describe('isReachableFromOtherDevices', () => {
    it('is null before anything binds — unknown, not unreachable', () => {
      // Rendering "unknown" as a failure would put a scary banner on every
      // page load that beat the listen callback.
      expect(isReachableFromOtherDevices()).toBeNull();
    });

    it('is false for loopback only — the Mac Mini case', () => {
      // Brain won the race to :3000 but lost it to the mesh client, so it
      // bound 127.0.0.1 alone and stayed invisible to the tailnet for a week.
      registerBoundHost('127.0.0.1');
      expect(isReachableFromOtherDevices()).toBe(false);
    });

    it('is true once a routable address is bound', () => {
      registerBoundHost('127.0.0.1');
      registerBoundHost('100.64.0.6');
      expect(isReachableFromOtherDevices()).toBe(true);
    });

    it('counts a wildcard bind as reachable', () => {
      registerBoundHost('0.0.0.0');
      expect(isReachableFromOtherDevices()).toBe(true);
    });
  });
});
