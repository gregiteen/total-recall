// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import ModelsPage from './ModelsPage';
import * as api from '../api';

vi.mock('../api');

describe('ModelsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    
    // Mock the API responses
    vi.mocked(api.fetchHealth).mockResolvedValue({
      status: 'ok',
      version: '1.0.0',
      uptime: 1000,
      cli_agents: ['antigravity']
    });
    
    vi.mocked(api.fetchConfigJson).mockResolvedValue({
      brain: { preferred_agent: 'gemini' },
      secrets: { google_api_key: 'AIzaSy...' }
    });
    
    vi.mocked(api.fetchUsageStats).mockResolvedValue({
      totalTokens: 0,
      totalCost: 0,
      period: 'daily',
      series: []
    });
    
    vi.mocked(api.fetchGeminiModels).mockResolvedValue([
      { id: 'gemini-1.5-pro', displayName: 'Gemini 1.5 Pro' }
    ]);
    vi.mocked(api.fetchClaudeModels).mockResolvedValue([]);
    vi.mocked(api.fetchOpenaiModels).mockResolvedValue([]);
    vi.mocked(api.fetchOpenRouterModels).mockResolvedValue([]);
  });

  it('renders without crashing and displays fetched data', async () => {
    render(<ModelsPage />);

    // Shows loading state initially
    expect(screen.getByText(/Loading models and agents/i)).toBeInTheDocument();

    // Wait for the data to load and waterfall to finish
    await waitFor(() => {
      expect(screen.queryByText(/Loading models and agents/i)).not.toBeInTheDocument();
    });

    // Verify it renders the models section
    expect(screen.getByText(/Models & Agents/i)).toBeInTheDocument();
    expect(screen.getByText(/Gemini 1.5 Pro/i)).toBeInTheDocument();
    
    // Verify it called all APIs via Promise.all
    expect(api.fetchHealth).toHaveBeenCalledTimes(1);
    expect(api.fetchConfigJson).toHaveBeenCalledTimes(1);
    expect(api.fetchUsageStats).toHaveBeenCalledTimes(1);
    expect(api.fetchGeminiModels).toHaveBeenCalledTimes(1);
    expect(api.fetchClaudeModels).toHaveBeenCalledTimes(1);
    expect(api.fetchOpenaiModels).toHaveBeenCalledTimes(1);
    expect(api.fetchOpenRouterModels).toHaveBeenCalledTimes(1);
  });
});
