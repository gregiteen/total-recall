import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import fixtures from '@ssss/cli/conformance/fixtures.json' with { type: 'json' };
import { processOperationAsync } from '../operation-validator.mjs';
import { assertAdapterContract, runAdapterContractFixtures } from './adapter-contract.mjs';

const operation = fixtures.fixtures.find((item) => item.id === 'fixture-001');

function referenceAdapter() {
  return {
    id: 'ssss-app',
    async detect(target) {
      const pkg = JSON.parse(fs.readFileSync(path.join(target, 'package.json'), 'utf8'));
      return { supported: pkg.ssss?.adapter === 'ssss-app', adapter: 'ssss-app' };
    },
    async generate({ output }) {
      fs.writeFileSync(path.join(output, 'index.mjs'), 'export const ready = true;\n');
    },
    async executeSsss(request, { target, principal }) {
      if (principal?.verified !== true) return { success: false };
      return processOperationAsync(request, path.join(target, 'vault'), { agentRole: 'system' });
    },
    async rebuildProjection({ target }) {
      const document = path.join(target, 'vault', operation.request.path);
      const projection = path.join(target, 'projection.json');
      fs.writeFileSync(projection, JSON.stringify({ source: operation.request.path, bytes: fs.statSync(document).size }));
      return { path: projection };
    },
    async start() {
      const server = http.createServer((_req, response) => {
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify({ status: 'healthy' }));
      });
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      return {
        health: async () => (await fetch(`http://127.0.0.1:${address.port}/health`)).json(),
        stop: () => new Promise((resolve) => server.close(resolve))
      };
    },
    async cleanup({ generated }) {
      for (const dir of generated) fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

describe('shared app adapter contract', () => {
  it('rejects an incomplete adapter before running any fixture', () => {
    expect(() => assertAdapterContract({ id: 'bad', detect() {} })).toThrow(/generate/);
    expect(() => assertAdapterContract({ id: '../escape' })).toThrow(/safe/);
  });

  it('proves the reference lifecycle with the canonical SSSS operation fixture', async () => {
    await expect(runAdapterContractFixtures(referenceAdapter(), operation)).resolves.toEqual({
      valid: true,
      adapter: 'ssss-app',
      contract_version: '1.0.0'
    });
  });

  it('rejects generation that mutates the target during planning', async () => {
    const bad = referenceAdapter();
    bad.generate = async ({ target, output }) => {
      fs.writeFileSync(path.join(target, 'surprise.txt'), 'changed target');
      fs.writeFileSync(path.join(output, 'index.mjs'), 'export {};\n');
    };
    await expect(runAdapterContractFixtures(bad, operation)).rejects.toThrow(/generation.*changed the target/);
  });

  it('rejects a projection stored outside the app', async () => {
    const bad = referenceAdapter();
    bad.rebuildProjection = async ({ target }) => ({ path: path.dirname(target) });
    await expect(runAdapterContractFixtures(bad, operation)).rejects.toThrow(/projection.*inside the app/);
  });

  it('rejects cleanup that destroys tenant-private data', async () => {
    const bad = referenceAdapter();
    bad.cleanup = async ({ target }) => {
      fs.writeFileSync(path.join(target, 'vault', 'tenant-private.txt'), 'destroyed');
    };
    await expect(runAdapterContractFixtures(bad, operation)).rejects.toThrow(/cleanup.*tenant-private/);
  });
});
