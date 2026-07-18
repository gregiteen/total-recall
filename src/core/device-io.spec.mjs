import { describe, it, expect } from 'vitest';
import {
  buildIoProfileFromSignals,
  uiHintsFromIo,
  mergeIoProfiles,
} from './device-io.mjs';

describe('buildIoProfileFromSignals', () => {
  it('marks headless SSH without display', () => {
    const p = buildIoProfileFromSignals({
      hasSshWithoutDisplay: true,
      hasDisplayEnv: false,
      keyboard: true,
      sources: ['env'],
    });
    expect(p.headless).toBe(true);
    expect(p.channels).toContain('headless');
    expect(p.display.present).toBe(false);
  });

  it('includes touch and screen for touchscreen profiles', () => {
    const p = buildIoProfileFromSignals({
      forceScreen: true,
      touch: true,
      keyboard: false,
      pointer: false,
      width: 1080,
      height: 1920,
      sources: ['test'],
    });
    expect(p.channels).toEqual(expect.arrayContaining(['screen', 'touch']));
    expect(p.display.touch).toBe(true);
    const hints = uiHintsFromIo(p);
    expect(hints).toContain('touch_targets_large');
    expect(hints).toContain('avoid_hover_only');
  });

  it('suggests multimodal chat when screen + mic + speaker', () => {
    const p = buildIoProfileFromSignals({
      forceScreen: true,
      microphone: true,
      speaker: true,
      keyboard: true,
      pointer: true,
      sources: ['test'],
    });
    expect(uiHintsFromIo(p)).toContain('multimodal_chat_ok');
  });
});

describe('mergeIoProfiles', () => {
  it('lets entity override force touch for agent UI', () => {
    const live = buildIoProfileFromSignals({
      forceScreen: true,
      touch: false,
      keyboard: true,
      pointer: true,
      sources: ['live'],
    });
    const merged = mergeIoProfiles(live, {
      display: { touch: true },
      channels: ['screen', 'touch', 'keyboard', 'pointer'],
    });
    expect(merged.display.touch).toBe(true);
    expect(merged.channels).toContain('touch');
    expect(merged.sources).toContain('entity-override');
  });
});
