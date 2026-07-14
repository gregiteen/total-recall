import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import GraphPage from './GraphPage';
import * as api from '../api';

vi.mock('../api');

describe('GraphPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without crashing', async () => {
    vi.mocked(api.listMemory).mockResolvedValue([]);
    vi.mocked(api.listResearch).mockResolvedValue({ items: [] } as any);
    vi.mocked(api.fetchChatThreads).mockResolvedValue([]);

    render(<GraphPage activeBrainId="global" />);
    
    // Smoke test, expect a title or fallback. The page has "Memory Graph"
    expect(screen.getByText(/Memory Graph/i)).toBeInTheDocument();
  });
});
