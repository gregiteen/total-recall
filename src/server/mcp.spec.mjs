import { describe, it, expect } from 'vitest';
import request from 'supertest';
import app from './mcp.mjs';

describe('MCP Gateway', () => {
  it('rejects POST /mcp without session ID for non-initialize', async () => {
    const res = await request(app)
      .post('/mcp')
      .send({ method: 'some_method' });
      
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });
});
