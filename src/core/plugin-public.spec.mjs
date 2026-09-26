import { describe, expect, it } from 'vitest';
import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { fetchPublicBundle, parsePublicPluginSource, publicPluginShareUrl } from './plugin-public.mjs';

const SHA = 'a'.repeat(64);
const link = `https://plugins.example.com/api/public/plugins/git-sentinel/bundle#sha256=${SHA}`;

function responseRequest(statusCode, body) {
  return (_url, options, callback) => {
    const request = new EventEmitter();
    request.end = () => {
      options.lookup('plugins.example.com', {}, (err, address) => {
        if (err) return request.emit('error', err);
        expect(address).toBe('8.8.8.8');
        const response = Readable.from([Buffer.from(body)]);
        response.statusCode = statusCode;
        callback(response);
      });
    };
    request.destroy = (err) => request.emit('error', err);
    return request;
  };
}

describe('public plugin exchange', () => {
  it('creates a direct link with a content pin', () => {
    expect(publicPluginShareUrl('git-sentinel', SHA, 'https://plugins.example.com')).toBe(link);
    expect(parsePublicPluginSource(link)).toMatchObject({ id: 'git-sentinel', sha256: SHA });
  });

  it('rejects links without HTTPS and an exact SHA-256 pin', () => {
    expect(() => parsePublicPluginSource(link.replace('https:', 'http:'))).toThrow(/HTTPS/);
    expect(() => parsePublicPluginSource(link.split('#')[0])).toThrow(/SHA-256/);
    expect(() => parsePublicPluginSource(link.replace('plugins.example.com', 'user:pass@plugins.example.com'))).toThrow(/credentials/);
  });

  it('fetches a bundle from a pinned public address', async () => {
    const result = await fetchPublicBundle(link, {
      lookup: async () => [{ address: '8.8.8.8' }],
      request: responseRequest(200, '{"format":"tr-plugin-bundle/1"}')
    });
    expect(result).toMatchObject({ id: 'git-sentinel', sha256: SHA, bundle: { format: 'tr-plugin-bundle/1' } });
  });

  it('blocks private and mixed DNS results before requesting', async () => {
    const request = () => { throw new Error('request must not run'); };
    await expect(fetchPublicBundle(link, { lookup: async () => [{ address: '127.0.0.1' }], request })).rejects.toThrow(/public IPv4/);
    await expect(fetchPublicBundle(link, { lookup: async () => [{ address: '8.8.8.8' }, { address: '10.0.0.1' }], request })).rejects.toThrow(/public IPv4/);
  });

  it('refuses redirects', async () => {
    await expect(fetchPublicBundle(link, {
      lookup: async () => [{ address: '8.8.8.8' }],
      request: responseRequest(302, '')
    })).rejects.toThrow(/HTTP 302/);
  });
});
