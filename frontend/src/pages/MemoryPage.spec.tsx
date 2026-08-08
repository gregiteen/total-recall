import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import MemoryPage from './MemoryPage';
import * as api from '../api';

vi.mock('../api');

describe('MemoryPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<BrowserRouter>{ui}</BrowserRouter>);
  };

  it('renders correctly and loads nodes', async () => {
    vi.mocked(api.listMemory).mockResolvedValue([
      { slug: 'test-node', title: 'Test Node', category: 'invariants', content: 'test content' }
    ] as never);

    renderWithRouter(<MemoryPage />);

    expect(screen.getByText(/Memory Vault/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Test Node/i)).toBeInTheDocument();
    });
  });

  it('switches to Sessions tab', async () => {
    vi.mocked(api.listMemory).mockResolvedValue([]);
    vi.mocked(api.fetchSessions).mockResolvedValue({
      sessions: [
        { id: 'sess-1', brain_id: 'default', total_chunks: 5, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), status: 'active' }
      ],
      total: 1
    } as never);

    renderWithRouter(<MemoryPage />);

    const sessionsTabBtn = screen.getByText(/Sessions/i);
    fireEvent.click(sessionsTabBtn);

    await waitFor(() => {
      expect(api.fetchSessions).toHaveBeenCalled();
      expect(screen.getByText(/sess-1/i)).toBeInTheDocument();
    });
  });
});
