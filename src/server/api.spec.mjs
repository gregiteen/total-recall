import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import { apiRouter } from './api.mjs';

const app = express();
app.use(express.json());
app.use(apiRouter);

describe('API Proxy', () => {
  it('returns 401 for unauthenticated /v1/chat/completions call', async () => {
    const res = await request(app)
      .post('/v1/chat/completions')
      .send({ messages: [{ role: 'user', content: 'hello' }] });
      
    expect(res.status).toBe(401); // Unauthorized
  });
});
