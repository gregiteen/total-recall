import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import GraphPage from './GraphPage';
import * as api from '../api';

vi.mock('../api');

describe('GraphPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without crashing', async () => {
    vi.mocked(api.fetchGraphData).mockResolvedValue({
      nodes: [{ id: 'test', label: 'Test', size: 10, category: 'test' }],
      links: []
    });

    render(<GraphPage activeBrainId="global" />);
    
    // Smoke test, expect a title or fallback. The page has "Memory Graph"
    expect(screen.getByText(/Memory Graph/i)).toBeInTheDocument();
  });
});
