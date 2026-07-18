/**
 * Device I/O capability profile — variables of the host device entity.
 *
 * Agents use this to choose UI/output surfaces:
 *   screen, touch, keyboard, pointer, mic, speaker, camera, …
 *
 * Detection is best-effort and portable (env + optional OS probes).
 * Vault/entity overrides always win for install-specific truth.
 * Never hardcode personal device names.
 */
import fs from 'node:fs';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

/** @typedef {'screen'|'touch'|'keyboard'|'pointer'|'microphone'|'speaker'|'camera'|'headless'} IoChannel */

/**
 * @typedef {object} DeviceIoProfile
 * @property {boolean} headless
 * @property {{ present: boolean, touch: boolean, count: number|null, width: number|null, height: number|null }} display
 * @property {{ input: boolean, output: boolean }} audio
 * @property {{ present: boolean }} camera
 * @property {{ keyboard: boolean, pointer: boolean, touch: boolean }} input
 * @property {IoChannel[]} channels  — flat list for agents
 * @property {string[]} sources      — how signals were gathered
 * @property {string} measured_at
 * @property {string} platform
 */

/**
 * Classify I/O from pure signals (testable without OS).
 * @param {object} signals
 * @returns {DeviceIoProfile}
 */
export function buildIoProfileFromSignals(signals = {}) {
  const sources = Array.isArray(signals.sources) ? [...signals.sources] : [];
  const hasDisplayEnv = !!signals.hasDisplayEnv;
  const hasSshWithoutDisplay = !!signals.hasSshWithoutDisplay;
  const displayCount = Number.isFinite(signals.displayCount) ? signals.displayCount : null;
  const width = Number.isFinite(signals.width) ? signals.width : null;
  const height = Number.isFinite(signals.height) ? signals.height : null;
  const touch = !!signals.touch;
  const keyboard = signals.keyboard !== false; // default true when interactive
  const pointer = signals.pointer !== false;
  const mic = !!signals.microphone;
  const speaker = !!signals.speaker;
  const camera = !!signals.camera;

  const screenPresent =
    hasDisplayEnv ||
    (displayCount != null && displayCount > 0) ||
    (width != null && height != null) ||
    !!signals.forceScreen;

  const headless =
    !!signals.forceHeadless ||
    (!screenPresent && (hasSshWithoutDisplay || !!signals.ci || signals.tty === false));

  /** @type {IoChannel[]} */
  const channels = [];
  if (headless && !screenPresent) channels.push('headless');
  if (screenPresent) channels.push('screen');
  if (touch) channels.push('touch');
  if (keyboard) channels.push('keyboard');
  if (pointer) channels.push('pointer');
  if (mic) channels.push('microphone');
  if (speaker) channels.push('speaker');
  if (camera) channels.push('camera');

  return {
    headless: headless && !screenPresent,
    display: {
      present: screenPresent,
      touch,
      count: displayCount,
      width,
      height,
    },
    audio: {
      input: mic,
      output: speaker,
    },
    camera: { present: camera },
    input: {
      keyboard: !!keyboard,
      pointer: !!pointer,
      touch,
    },
    channels: [...new Set(channels)],
    sources,
    measured_at: signals.measured_at || new Date().toISOString(),
    platform: signals.platform || process.platform,
  };
}

/**
 * Agent-facing UI generation hints derived from I/O channels.
 * Pure function — no device hardcoding.
 */
export function uiHintsFromIo(profile) {
  const ch = new Set(profile?.channels || []);
  const hints = [];
  if (ch.has('headless') && !ch.has('screen')) {
    hints.push('prefer_cli_or_api');
    hints.push('no_visual_ui');
  }
  if (ch.has('screen') && !ch.has('touch')) {
    hints.push('desktop_or_browser_ui');
    hints.push('pointer_precision_ok');
  }
  if (ch.has('touch')) {
    hints.push('touch_targets_large');
    hints.push('gesture_friendly');
    hints.push('avoid_hover_only');
  }
  if (ch.has('microphone')) hints.push('voice_input_ok');
  if (ch.has('speaker')) hints.push('voice_output_ok');
  if (ch.has('camera')) hints.push('vision_input_ok');
  if (ch.has('screen') && ch.has('microphone') && ch.has('speaker')) {
    hints.push('multimodal_chat_ok');
  }
  return [...new Set(hints)];
}

function envSignals() {
  const sources = ['env'];
  const hasDisplayEnv = !!(
    process.env.DISPLAY ||
    process.env.WAYLAND_DISPLAY ||
    process.env.MIR_SOCKET
  );
  const hasSshWithoutDisplay = !!(process.env.SSH_CONNECTION || process.env.SSH_CLIENT) && !hasDisplayEnv;
  const ci = !!(process.env.CI || process.env.GITHUB_ACTIONS);
  let tty = false;
  try {
    tty = !!(process.stdout.isTTY || process.stdin.isTTY);
  } catch {
    tty = false;
  }
  return {
    sources,
    hasDisplayEnv,
    hasSshWithoutDisplay,
    ci,
    tty,
    platform: process.platform,
  };
}

function probeLinuxInput(signals) {
  const sources = [...(signals.sources || [])];
  try {
    if (fs.existsSync('/sys/class/input')) {
      sources.push('sysfs-input');
      const names = fs.readdirSync('/sys/class/input');
      for (const n of names) {
        const namePath = `/sys/class/input/${n}/name`;
        if (!fs.existsSync(namePath)) continue;
        const label = fs.readFileSync(namePath, 'utf8').toLowerCase();
        if (label.includes('touch') || label.includes('fts') || label.includes('goodix')) {
          signals.touch = true;
        }
        if (label.includes('mouse') || label.includes('trackpad') || label.includes('trackball')) {
          signals.pointer = true;
        }
        if (label.includes('keyboard') || label.includes('kbd')) {
          signals.keyboard = true;
        }
      }
    }
    if (fs.existsSync('/dev/video0') || fs.existsSync('/dev/video1')) {
      sources.push('dev-video');
      signals.camera = true;
    }
    // ALSA / Pulse rough presence
    if (fs.existsSync('/dev/snd') || fs.existsSync('/proc/asound')) {
      sources.push('alsa');
      signals.speaker = true;
      signals.microphone = true; // best-effort; refine via vault override
    }
  } catch {
    // ignore
  }
  signals.sources = sources;
  return signals;
}

function probeDarwin(signals) {
  const sources = [...(signals.sources || [])];
  const spawn = signals.spawnSync || spawnSync;
  try {
    // Displays
    const disp = spawn('system_profiler', ['SPDisplaysDataType', '-json'], {
      encoding: 'utf8',
      timeout: 8_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (disp.status === 0 && disp.stdout) {
      sources.push('system_profiler:displays');
      const json = JSON.parse(disp.stdout);
      const displays = json?.SPDisplaysDataType || [];
      let count = 0;
      let touch = false;
      let w = null;
      let h = null;
      for (const gpu of displays) {
        const nd = gpu?.spdisplays_ndrvs || gpu?.['_spdisplays_display'] || [];
        const list = Array.isArray(nd) ? nd : [];
        for (const d of list) {
          count += 1;
          const res = d?._spdisplays_resolution || d?.spdisplays_resolution || '';
          const m = String(res).match(/(\d+)\s*x\s*(\d+)/i);
          if (m) {
            w = Number(m[1]);
            h = Number(m[2]);
          }
          const name = JSON.stringify(d).toLowerCase();
          if (name.includes('touch') || name.includes('trackpad')) touch = true;
        }
      }
      if (count > 0) {
        signals.displayCount = count;
        signals.forceScreen = true;
        signals.width = w;
        signals.height = h;
      }
      // Built-in trackpad often implies pointer; Force Touch trackpads aren't full touch UI
      if (touch) signals.pointer = true;
    }
  } catch {
    // optional
  }

  try {
    const audio = spawn('system_profiler', ['SPAudioDataType', '-json'], {
      encoding: 'utf8',
      timeout: 8_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (audio.status === 0 && audio.stdout) {
      sources.push('system_profiler:audio');
      const json = JSON.parse(audio.stdout);
      const blob = JSON.stringify(json).toLowerCase();
      if (blob.includes('input') || blob.includes('microphone') || blob.includes('built-in microphone')) {
        signals.microphone = true;
      }
      if (blob.includes('output') || blob.includes('speaker') || blob.includes('headphones')) {
        signals.speaker = true;
      }
    }
  } catch {
    // optional
  }

  try {
    const cam = spawn('system_profiler', ['SPCameraDataType', '-json'], {
      encoding: 'utf8',
      timeout: 5_000,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    if (cam.status === 0 && cam.stdout && cam.stdout.includes('spcamera_model-id')) {
      sources.push('system_profiler:camera');
      signals.camera = true;
    }
  } catch {
    // optional
  }

  // Desktop macOS defaults when not SSH headless
  if (!signals.hasSshWithoutDisplay) {
    signals.keyboard = signals.keyboard !== false;
    signals.pointer = signals.pointer !== false;
  }

  signals.sources = sources;
  return signals;
}

/**
 * Live I/O profile for this host (entity variables for mesh_node / agents).
 * @param {{ spawnSync?: Function, envSignals?: object, skipOsProbes?: boolean }} [deps]
 */
export function detectDeviceIo(deps = {}) {
  let signals = { ...envSignals(), ...(deps.envSignals || {}) };
  if (deps.spawnSync) signals.spawnSync = deps.spawnSync;

  if (!deps.skipOsProbes) {
    if (process.platform === 'linux') signals = probeLinuxInput(signals);
    else if (process.platform === 'darwin') signals = probeDarwin(signals);
    else {
      // Windows / other: env only; entity overrides fill gaps
      signals.sources = [...(signals.sources || []), 'env-only'];
      if (signals.hasDisplayEnv) {
        signals.forceScreen = true;
        signals.keyboard = true;
        signals.pointer = true;
      }
    }
  }

  const profile = buildIoProfileFromSignals(signals);
  profile.ui_hints = uiHintsFromIo(profile);
  return profile;
}

/**
 * Merge live detection with vault entity overrides (entity wins on explicit keys).
 */
export function mergeIoProfiles(live, entityIo) {
  if (!entityIo || typeof entityIo !== 'object') {
    return { ...live, ui_hints: uiHintsFromIo(live) };
  }
  const merged = {
    ...live,
    display: { ...live.display, ...(entityIo.display || {}) },
    audio: { ...live.audio, ...(entityIo.audio || {}) },
    camera: { ...live.camera, ...(entityIo.camera || {}) },
    input: { ...live.input, ...(entityIo.input || {}) },
    sources: [...new Set([...(live.sources || []), 'entity-override', ...((entityIo.sources) || [])])],
  };
  // Rebuild channels from merged flags if entity provided channels
  if (Array.isArray(entityIo.channels) && entityIo.channels.length) {
    merged.channels = [...new Set([...(live.channels || []), ...entityIo.channels])];
  } else {
    merged.channels = buildIoProfileFromSignals({
      forceScreen: merged.display.present,
      touch: merged.display.touch || merged.input.touch,
      keyboard: merged.input.keyboard,
      pointer: merged.input.pointer,
      microphone: merged.audio.input,
      speaker: merged.audio.output,
      camera: merged.camera.present,
      forceHeadless: merged.headless && !merged.display.present,
      displayCount: merged.display.count,
      width: merged.display.width,
      height: merged.display.height,
      sources: merged.sources,
      platform: live.platform,
    }).channels;
  }
  if (typeof entityIo.headless === 'boolean') merged.headless = entityIo.headless;
  merged.ui_hints = uiHintsFromIo(merged);
  return merged;
}
