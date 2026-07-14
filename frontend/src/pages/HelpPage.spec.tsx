import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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
    } as any);

    vi.mocked(api.fetchHelpContent).mockResolvedValue({
      content: '# CLI Reference\n\nSome helpful text.'
    } as any);

    render(<HelpPage />);

    expect(screen.getByText(/Help & CLI Reference/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/CLI Reference/i)[0]).toBeInTheDocument();
      expect(screen.getByText(/Vault Structure/i)).toBeInTheDocument();
      expect(screen.getByText(/Some helpful text./i)).toBeInTheDocument();
    });
  });

  it('switches topics', async () => {
    vi.mocked(api.fetchHelpTopics).mockResolvedValue({
      topics: [
        { id: 'cli', title: 'CLI Reference', description: 'Commands for CLI' },
        { id: 'vault', title: 'Vault Structure', description: 'How files are stored' }
      ]
    } as any);

    vi.mocked(api.fetchHelpContent).mockResolvedValueOnce({
      content: 'CLI content'
    } as any).mockResolvedValueOnce({
      content: 'Vault content'
    } as any);

    render(<HelpPage />);

    await waitFor(() => {
      expect(screen.getByText(/CLI content/i)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText(/Vault Structure/i));

    await waitFor(() => {
      expect(api.fetchHelpContent).toHaveBeenCalledWith('vault');
      expect(screen.getByText(/Vault content/i)).toBeInTheDocument();
    });
  });
});
