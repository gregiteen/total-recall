import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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

    await act(async () => {
      render(<OpenWikiPage activeBrainId="global" />);
    });

    expect(screen.getByText(/Knowledge Graph/i)).toBeInTheDocument();
    expect(await screen.findByText(/Test Node/i, undefined, { timeout: 4000 })).toBeInTheDocument();
  }, 10000);
});
