// @ts-nocheck
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import VaultPage from './VaultPage';
import { BrowserRouter } from 'react-router-dom';
import * as api from '../api';

vi.mock('../api');

describe('VaultPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without crashing', async () => {
    vi.mocked(api.fetchDocs).mockResolvedValue({ docs: [], total: 0 });
    vi.mocked(api.fetchViews).mockResolvedValue([]);

    render(
      <BrowserRouter>
        <VaultPage activeBrainId="global" />
      </BrowserRouter>
    );

    expect(screen.getByText(/Vault Manager/i)).toBeInTheDocument();
  });
});
