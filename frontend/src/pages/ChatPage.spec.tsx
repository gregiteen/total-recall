import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import ChatPage from './ChatPage';
import { BrowserRouter } from 'react-router-dom';
import * as api from '../api';

vi.mock('../api');

describe('ChatPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });

  it('renders correctly', async () => {
    vi.mocked(api.fetchChatThreads).mockResolvedValue([]);
    vi.mocked(api.listResearch).mockResolvedValue({ items: [] } as any);
    vi.mocked(api.fetchHealth).mockResolvedValue({ cli_agents: ['antigravity', 'claude'] } as any);
    vi.mocked(api.fetchGeminiModels).mockResolvedValue([]);
    vi.mocked(api.checkUpdate).mockResolvedValue({ updateAvailable: false } as any);
    vi.mocked(api.fetchExtensionStatus).mockResolvedValue({ available: false, connected: false });
    vi.mocked(api.listMemory).mockResolvedValue([]);
    vi.mocked(api.fetchChatHistory).mockResolvedValue([]);

    await act(async () => {
      render(
        <BrowserRouter>
          <ChatPage />
        </BrowserRouter>
      );
    });

    expect(await screen.findByText(/Chat Session/i, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(await screen.findByText(/Model \/ provider:/i, undefined, { timeout: 4000 })).toBeInTheDocument();
    expect(await screen.findByText(/New Chat/i, undefined, { timeout: 4000 })).toBeInTheDocument();
  }, 10000);
});
