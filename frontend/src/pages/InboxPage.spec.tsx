import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import InboxPage from './InboxPage';
import * as api from '../api';

vi.mock('../api');

describe('InboxPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly and loads pending items', async () => {
    vi.mocked(api.fetchDocs).mockResolvedValue({
      docs: [
        { path: 'proposals/p1.md', name: 'Proposal 1', type: 'proposal', status: 'pending_approval' }
      ]
    } as any);

    render(<InboxPage />);

    expect(screen.getByText(/Approval Inbox/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/Proposal 1/i)).toBeInTheDocument();
      expect(screen.getByText(/pending_approval/i)).toBeInTheDocument();
    });
  });

  it('handles approving a proposal', async () => {
    vi.mocked(api.fetchDocs).mockResolvedValue({
      docs: [
        { path: 'proposals/p2.md', name: 'Proposal 2', type: 'proposal', status: 'pending_approval' }
      ]
    } as any);

    vi.mocked(api.readDoc).mockResolvedValue({ raw: 'status: pending_approval' } as any);
    vi.mocked(api.postDecision).mockResolvedValue({} as any);

    render(<InboxPage />);

    await waitFor(() => {
      expect(screen.getByText(/Proposal 2/i)).toBeInTheDocument();
    });

    const approveButton = screen.getByText(/Approve/i);
    fireEvent.click(approveButton);

    await waitFor(() => {
      expect(api.readDoc).toHaveBeenCalledWith('proposals/p2.md', undefined);
      expect(api.postDecision).toHaveBeenCalledWith('p2', 'approved');
      expect(api.fetchDocs).toHaveBeenCalledTimes(2); // Initial load + refresh
    });
  });
});
