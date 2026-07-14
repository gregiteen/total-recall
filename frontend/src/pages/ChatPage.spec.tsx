import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

    render(
      <BrowserRouter>
        <ChatPage />
      </BrowserRouter>
    );

    await waitFor(() => {
      expect(screen.getByText(/Chat Session/i)).toBeInTheDocument();
      expect(screen.getByText(/Model \/ provider:/i)).toBeInTheDocument();
      expect(screen.getByText(/New Chat/i)).toBeInTheDocument();
    });
  });
});
