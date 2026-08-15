
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import OnboardingPage from './OnboardingPage';
import * as api from '../api';

vi.mock('../api');

describe('OnboardingPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  const renderWithRouter = (ui: React.ReactElement) => {
    return render(<BrowserRouter>{ui}</BrowserRouter>);
  };

  it('renders welcome step first', async () => {
    vi.mocked(api.listMemory).mockResolvedValue([] as never);

    renderWithRouter(<OnboardingPage />);

    await waitFor(() => {
      expect(screen.getByText(/Welcome to Total Recall/i)).toBeInTheDocument();
    });
  });

  it('navigates to next step', async () => {
    vi.mocked(api.listMemory).mockResolvedValue([] as never);
    vi.mocked(api.scanEnvSecrets).mockResolvedValue({ candidates: [] } as never);

    renderWithRouter(<OnboardingPage />);

    const continueBtn = screen.getByText('Continue');
    fireEvent.click(continueBtn);

    await waitFor(() => {
      expect(screen.getByText(/Import your API keys/i)).toBeInTheDocument();
    });
  });

  it('handles scan import mode', async () => {
    vi.mocked(api.listMemory).mockResolvedValue([] as never);
    vi.mocked(api.scanEnvSecrets).mockResolvedValue({
      candidates: [
        {
          key: 'TEST_KEY',
          provider: 'test',
          masked: 'sk-***',
          source_label: '.env',
          source: '.env',
          length: 12,
          known: true,
        },
      ],
      count: 1,
      sources_scanned: ['.env'],
    });

    renderWithRouter(<OnboardingPage />);

    // Go to import step
    fireEvent.click(screen.getByText('Continue'));

    await waitFor(() => {
      expect(screen.getByText(/TEST_KEY/i)).toBeInTheDocument();
    });
  });
});
