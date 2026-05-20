import { describe, it, expect, vi } from 'vitest';
import { handleToolCall, AVAILABLE_TOOLS } from './tools.mjs';

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
});
