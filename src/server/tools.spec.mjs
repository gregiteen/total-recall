import { describe, it, expect, vi } from 'vitest';

const gate = vi.hoisted(() => ({ requestResearch: vi.fn() }));
vi.mock('../core/research-gate.mjs', () => gate);

import { handleToolCall, AVAILABLE_TOOLS } from './tools.mjs';

describe('queue_research tool (human asks for research in conversation)', () => {
  it('is offered to the model, limited to explicit user requests', () => {
    const tool = AVAILABLE_TOOLS.find(t => t.function.name === 'queue_research');
    expect(tool).toBeDefined();
    expect(tool.function.parameters.required).toEqual(['topic']);
    expect(tool.function.description).toMatch(/ONLY when the user explicitly asks/);
  });

  it('queues through the gate as a user request from chat', async () => {
    gate.requestResearch.mockReturnValue({ id: 'r1', topic: 'Stripe webhooks', status: 'pending' });
    const out = JSON.parse(await handleToolCall({
      function: { name: 'queue_research', arguments: JSON.stringify({ topic: 'Stripe webhooks', notes: 'for billing' }) },
    }));
    expect(gate.requestResearch).toHaveBeenCalledWith({ topic: 'Stripe webhooks', notes: 'for billing', via: 'chat' });
    expect(out).toMatchObject({ id: 'r1', status: 'queued' });
  });
});

describe('Tools API', () => {
  it('should export AVAILABLE_TOOLS containing search_web', () => {
    expect(AVAILABLE_TOOLS).toBeInstanceOf(Array);
    const searchTool = AVAILABLE_TOOLS.find(t => t.function.name === 'search_web');
    expect(searchTool).toBeDefined();
    expect(searchTool.function.parameters.properties.query).toBeDefined();
  });

  it('should handle unknown tools gracefully', async () => {
    const fakeToolCall = {
      function: {
        name: 'fake_tool',
        arguments: JSON.stringify({})
      }
    };
    
    const result = await handleToolCall(fakeToolCall);
    expect(result).toBe('Unknown tool: fake_tool');
  });

  it('should attempt to fetch from SearXNG when search_web is called', async () => {
    // Mock the global fetch
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [
          { title: 'Test Result', url: 'https://test.com', content: 'Test snippet' }
        ]
      })
    });

    const searchToolCall = {
      function: {
        name: 'search_web',
        arguments: JSON.stringify({ query: 'test query' })
      }
    };

    const result = await handleToolCall(searchToolCall);
    expect(global.fetch).toHaveBeenCalled();
    expect(result).toContain('Search results for "test query"');
    expect(result).toContain('Test Result');
    expect(result).toContain('https://test.com');
  });

  it('should export mesh tools in AVAILABLE_TOOLS', () => {
    const names = AVAILABLE_TOOLS.map(t => t.function.name);
    expect(names).toContain('mesh_list_nodes');
    expect(names).toContain('mesh_status');
    expect(names).toContain('mesh_exec');
    expect(names).toContain('mesh_set_access');
    expect(names).toContain('mesh_ping');
    expect(names).toContain('mesh_mint_preauthkey');
  });

  it('should handle mesh_list_nodes tool call', async () => {
    const call = {
      function: {
        name: 'mesh_list_nodes',
        arguments: JSON.stringify({}),
      },
    };
    const result = await handleToolCall(call);
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(Array.isArray(parsed)).toBe(true);
  });

  it('should handle mesh_status tool call', async () => {
    const call = {
      function: {
        name: 'mesh_status',
        arguments: JSON.stringify({}),
      },
    };
    const result = await handleToolCall(call);
    expect(() => JSON.parse(result)).not.toThrow();
    const parsed = JSON.parse(result);
    expect(parsed).toHaveProperty('mesh_online');
    expect(parsed).toHaveProperty('headscale_configured');
  });

  it('should validate mesh_exec parameters', async () => {
    const call = {
      function: {
        name: 'mesh_exec',
        arguments: JSON.stringify({}),
      },
    };
    const result = await handleToolCall(call);
    expect(result).toContain('required');
  });

  it('should validate mesh_set_access parameters', async () => {
    const call = {
      function: {
        name: 'mesh_set_access',
        arguments: JSON.stringify({}),
      },
    };
    const result = await handleToolCall(call);
    expect(result).toContain('required');
  });

  it('should validate mesh_ping parameters', async () => {
    const call = {
      function: {
        name: 'mesh_ping',
        arguments: JSON.stringify({}),
      },
    };
    const result = await handleToolCall(call);
    expect(result).toContain('required');
  });
});

