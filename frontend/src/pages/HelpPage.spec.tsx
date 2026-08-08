import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import HelpPage from './HelpPage';
import * as api from '../api';

vi.mock('../api');

describe('HelpPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly and loads topics', async () => {
    vi.mocked(api.fetchHelpTopics).mockResolvedValue({
      topics: [
        { id: 'cli', title: 'CLI Reference', description: 'Commands for CLI' },
        { id: 'vault', title: 'Vault Structure', description: 'How files are stored' }
      ]
    } as never);

    vi.mocked(api.fetchHelpContent).mockResolvedValue({
      content: '# CLI Reference\n\nSome helpful text.'
    } as never);

    await act(async () => {
      render(<HelpPage />);
    });

    expect(screen.getByText(/Help & CLI Reference/i)).toBeInTheDocument();
    expect(screen.getAllByText(/CLI Reference/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/Vault Structure/i)).toBeInTheDocument();
    
    expect(await screen.findByText(/Some helpful text./i, undefined, { timeout: 4000 })).toBeInTheDocument();
  }, 10000);

  it('switches topics', async () => {
    vi.mocked(api.fetchHelpTopics).mockResolvedValue({
      topics: [
        { id: 'cli', title: 'CLI Reference', description: 'Commands for CLI' },
        { id: 'vault', title: 'Vault Structure', description: 'How files are stored' }
      ]
    } as never);

    vi.mocked(api.fetchHelpContent).mockResolvedValueOnce({
      content: 'CLI content'
    } as never).mockResolvedValueOnce({
      content: 'Vault content'
    } as never);

    await act(async () => {
      render(<HelpPage />);
    });

    expect(await screen.findByText(/CLI content/i, undefined, { timeout: 4000 })).toBeInTheDocument();

    await act(async () => {
      screen.getByText(/Vault Structure/i).click();
    });

    expect(api.fetchHelpContent).toHaveBeenCalledWith('vault');
    expect(await screen.findByText(/Vault content/i, undefined, { timeout: 4000 })).toBeInTheDocument();
  }, 10000);
});
