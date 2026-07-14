import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import ApiKeysPage from './ApiKeysPage';
import { BrowserRouter } from 'react-router-dom';
import * as api from '../api';

vi.mock('../api');

describe('ApiKeysPage', () => {
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

    render(
      <BrowserRouter>
        <ApiKeysPage />
      </BrowserRouter>
    );

    expect(screen.getByText(/Secrets & Access/i)).toBeInTheDocument();
  });
});
