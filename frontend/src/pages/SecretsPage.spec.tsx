import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SecretsPage from './SecretsPage';
import { BrowserRouter } from 'react-router-dom';
import * as api from '../api';

vi.mock('../api');

describe('SecretsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without crashing', async () => {
    vi.mocked(api.fetchConfigJson).mockResolvedValue({} as any);
    vi.mocked(api.fetchSecretsCatalog).mockResolvedValue({ keys: [], by_provider: [], store: 'mock-store' } as any);
    vi.mocked(api.listApiKeys).mockResolvedValue({ keys: [] } as any);
    vi.mocked(api.fetchWebAuthnStatus).mockResolvedValue({} as any);
    vi.mocked(api.fetchGeminiModels).mockResolvedValue([]);
    vi.mocked(api.fetchClaudeModels).mockResolvedValue([]);
    vi.mocked(api.fetchOpenaiModels).mockResolvedValue([]);
    vi.mocked(api.fetchOpenRouterModels).mockResolvedValue([]);
    vi.mocked(api.getSyncStatus).mockResolvedValue({ nodes: [], localChecksum: 'abc' } as any);

    render(
      <BrowserRouter>
        <SecretsPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Secrets & Access/i)).toBeInTheDocument();
  });
});
