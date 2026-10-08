/** Memory HTTP host. Optional capabilities own their servers and interfaces. */
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { requireHttps, corsOptions, apiRateLimiter, requireAuthOrLocal } from './auth.mjs';
import { memoryRouter } from './routes/memory.mjs';
import { authRouter } from './routes/auth.mjs';
import { keysRouter } from './routes/keys.mjs';
import instructionsRouter from './routes/instructions.mjs';
import contextRouter from './routes/context.mjs';
import { rulesRouter } from './routes/rules.mjs';
import { VAULT_DIR } from './routes/_shared.mjs';
import { getNodes } from '../core/vault-cache.mjs';

const { version } = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../../package.json', import.meta.url)), 'utf8'));

export function createMemoryApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(requireHttps);
  app.use(cors(corsOptions()));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.use('/api', apiRateLimiter());
  app.get('/health', requireAuthOrLocal, (_req, res) => {
    const initialized = fs.existsSync(VAULT_DIR);
    res.status(initialized ? 200 : 503).json({
      status: initialized ? 'healthy' : 'uninitialized', version,
      runtime: 'memory', memory: { initialized, nodes: initialized ? getNodes(VAULT_DIR).length : 0 },
    });
  });
  app.get('/.well-known/total-recall.json', (_req, res) => res.json({
    version, runtime: 'memory', endpoints: {
      memory: '/api/memory', context: '/api/context', instructions: '/api/instructions',
      rules: '/api/rules', health: '/health',
    },
  }));
  app.use(authRouter);
  app.use(keysRouter);
  app.use(memoryRouter);
  app.use(instructionsRouter);
  app.use(contextRouter);
  app.use(rulesRouter);
  app.use((_req, res) => res.status(404).json({ error: 'Endpoint unavailable in the memory runtime' }));
  return app;
}
