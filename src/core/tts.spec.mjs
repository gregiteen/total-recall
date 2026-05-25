import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { loadVoiceConfig, synthesize, TtsNotConfiguredError, isTtsEnabled } from './tts.mjs';

const AGENT_DIR = process.env.AGENT_DIR || path.join(os.homedir(), '.agent');
const BRAIN_DIR = path.join(AGENT_DIR, 'skills', 'total-recall');
const VOICE_FILE = path.join(BRAIN_DIR, 'config', 'voice.yml');

describe('TTS (Kokoro façade)', () => {
  let savedVoiceYml = null;

  beforeEach(() => {
    if (fs.existsSync(VOICE_FILE)) {
      savedVoiceYml = fs.readFileSync(VOICE_FILE, 'utf8');
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedVoiceYml !== null) {
      fs.writeFileSync(VOICE_FILE, savedVoiceYml);
      savedVoiceYml = null;
    } else {
      try { fs.unlinkSync(VOICE_FILE); } catch {}
    }
  });

  it('defaults to disabled engine when voice.yml is absent', () => {
    try { fs.unlinkSync(VOICE_FILE); } catch {}
    expect(isTtsEnabled()).toBe(false);
    const cfg = loadVoiceConfig();
    expect(cfg.tts.engine).toBe('disabled');
  });

  it('synthesize() throws TtsNotConfiguredError when engine is disabled', async () => {
    fs.mkdirSync(path.dirname(VOICE_FILE), { recursive: true });
    fs.writeFileSync(VOICE_FILE, 'tts:\n  engine: disabled\n');
    await expect(synthesize('hello')).rejects.toBeInstanceOf(TtsNotConfiguredError);
  });

  it('synthesize() POSTs to the configured endpoint and returns audio bytes', async () => {
    fs.mkdirSync(path.dirname(VOICE_FILE), { recursive: true });
    fs.writeFileSync(VOICE_FILE, [
      'tts:',
      '  engine: kokoro',
      '  endpoint: http://127.0.0.1:8880/v1/audio/speech',
      '  voice: af_heart',
      '  format: wav',
      '  speed: 1.0'
    ].join('\n'));

    const fakeWav = Buffer.from([0x52, 0x49, 0x46, 0x46, 0xff, 0xff, 0xff, 0xff]);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      arrayBuffer: async () => fakeWav.buffer.slice(fakeWav.byteOffset, fakeWav.byteOffset + fakeWav.byteLength)
    });

    const result = await synthesize('Hello world');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe('http://127.0.0.1:8880/v1/audio/speech');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.model).toBe('kokoro');
    expect(body.input).toBe('Hello world');
    expect(body.voice).toBe('af_heart');
    expect(body.response_format).toBe('wav');

    expect(result.format).toBe('wav');
    expect(result.mimeType).toBe('audio/wav');
    expect(Buffer.isBuffer(result.buffer)).toBe(true);
    expect(result.buffer.length).toBe(8);
  });

  it('synthesize() maps network failure to TtsNotConfiguredError for graceful frontend fallback', async () => {
    fs.mkdirSync(path.dirname(VOICE_FILE), { recursive: true });
    fs.writeFileSync(VOICE_FILE, 'tts:\n  engine: kokoro\n  endpoint: http://127.0.0.1:8880/v1/audio/speech\n');

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    await expect(synthesize('hi')).rejects.toBeInstanceOf(TtsNotConfiguredError);
  });

  it('synthesize() rejects empty input', async () => {
    await expect(synthesize('')).rejects.toThrow();
    await expect(synthesize('   ')).rejects.toThrow();
  });
});
