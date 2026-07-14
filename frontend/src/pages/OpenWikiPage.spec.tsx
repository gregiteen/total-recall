import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import OpenWikiPage from './OpenWikiPage';
import * as api from '../api';

vi.mock('../api');

describe('OpenWikiPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without crashing', async () => {
    vi.mocked(api.fetchOpenWikiNodes).mockResolvedValue([
      { slug: 'test-node', title: 'Test Node', category: 'concept', body: 'Test content' }
    ]);

    render(<OpenWikiPage activeBrainId="global" />);

    // Shows loading state initially
    expect(screen.getByText(/Syncing nodes/i)).toBeInTheDocument();

    // Wait for the data to load
    await waitFor(() => {
      expect(screen.queryByText(/Syncing nodes/i)).not.toBeInTheDocument();
    });

    // Verify it renders the loaded nodes
    expect(screen.getByText(/Knowledge Graph/i)).toBeInTheDocument();
    expect(screen.getByText(/Test Node/i)).toBeInTheDocument();
  });
});
