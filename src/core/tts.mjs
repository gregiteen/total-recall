/**
 * Total Recall — Text-to-Speech (Kokoro-82M)
 *
 * Kokoro-82M is a tiny (~82M parameter) high-quality multilingual TTS model.
 * The reference implementation runs in Python; the recommended deployment is
 * `kokoro-fastapi` or a similar HTTP wrapper running on the host.
 *
 * This module is the kernel-side façade. It does NOT bundle Python. Instead
 * it speaks HTTP to a local Kokoro service whose URL lives in voice.yml.
 * Operators wire Kokoro into systemd; the OS just routes through it.
 *
 * Configuration (~/.agent/config/voice.yml):
 *   tts:
 *     engine: kokoro            # or "disabled"
 *     endpoint: http://127.0.0.1:8880/v1/audio/speech
 *     voice: af_heart           # any Kokoro voice id
 *     format: wav               # wav | mp3 | flac | opus | pcm
 *     speed: 1.0
 *
 * Behavior:
 *   - When `engine: disabled` or no config exists → `synthesize()` throws
 *     `TtsNotConfiguredError`. The HTTP layer surfaces this as 503 so the
 *     frontend can fall back to browser speechSynthesis.
 *   - When configured → POSTs to `endpoint` using the OpenAI-compatible
 *     `/v1/audio/speech` contract (Kokoro-fastapi default) and streams the
 *     audio buffer back.
 */

import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { logger } from './logger.mjs';
import { brainDir } from './config.mjs';
import { throttledFetch } from './throttled-fetch.mjs';

const VOICE_CONFIG = path.join(brainDir, 'config', 'voice.yml');

const DEFAULT_CONFIG = {
  tts: {
    engine: 'disabled',
    endpoint: 'http://127.0.0.1:8880/v1/audio/speech',
    voice: 'af_heart',
    format: 'wav',
    speed: 1.0
  }
};

export class TtsNotConfiguredError extends Error {
  constructor(message = 'Kokoro TTS is not configured. See ~/.agent/config/voice.yml.') {
    super(message);
    this.name = 'TtsNotConfiguredError';
    this.code = 'TTS_NOT_CONFIGURED';
  }
}

export function loadVoiceConfig(file = VOICE_CONFIG) {
  if (!fs.existsSync(file)) return DEFAULT_CONFIG;
  try {
    const parsed = yaml.parse(fs.readFileSync(file, 'utf8')) || {};
    return { tts: { ...DEFAULT_CONFIG.tts, ...(parsed.tts || {}) } };
  } catch (err) {
    logger.error('tts', `Failed to parse voice.yml: ${err.message}`);
    return DEFAULT_CONFIG;
  }
}

const MIME_BY_FORMAT = {
  wav: 'audio/wav',
  mp3: 'audio/mpeg',
  flac: 'audio/flac',
  opus: 'audio/opus',
  pcm: 'audio/L16'
};

/**
 * Synthesize `text` to audio bytes using the configured Kokoro endpoint.
 *
 * @returns {Promise<{ buffer: Buffer, mimeType: string, format: string }>}
 * @throws  {TtsNotConfiguredError} when Kokoro is disabled or unreachable.
 */
export async function synthesize(text, opts = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('synthesize(): text must be a non-empty string');
  }

  const cfg = loadVoiceConfig().tts;
  if (cfg.engine === 'disabled' || !cfg.endpoint) {
    throw new TtsNotConfiguredError();
  }

  const voice = opts.voice || cfg.voice;
  const format = opts.format || cfg.format;
  const speed = opts.speed ?? cfg.speed;

  const body = {
    model: 'kokoro',
    input: text,
    voice,
    response_format: format,
    speed
  };

  const start = Date.now();
  let res;
  try {
    res = await throttledFetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    // Kokoro service down or unreachable — treat as not-configured so the
    // frontend can fall back rather than displaying a crash.
    logger.warn('tts', `Kokoro endpoint unreachable: ${err.message}`);
    throw new TtsNotConfiguredError(`Kokoro endpoint unreachable: ${err.message}`);
  }

  const latency_ms = Date.now() - start;

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    logger.error('tts', `Kokoro returned ${res.status}: ${detail.slice(0, 200)}`, { latency_ms });
    throw new Error(`Kokoro TTS failed: HTTP ${res.status}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  logger.info('tts', `synthesized ${buffer.length} bytes (${format}, voice=${voice})`, {
    latency_ms,
    bytes: buffer.length
  });

  return {
    buffer,
    mimeType: MIME_BY_FORMAT[format] || 'application/octet-stream',
    format
  };
}

export function isTtsEnabled() {
  const cfg = loadVoiceConfig().tts;
  return cfg.engine !== 'disabled' && !!cfg.endpoint;
}
