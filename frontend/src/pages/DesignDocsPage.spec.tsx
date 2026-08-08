import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import DesignDocsPage from './DesignDocsPage';
import * as api from '../api';

vi.mock('../api');

describe('DesignDocsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly', async () => {
    vi.mocked(api.fetchDesignDocs).mockResolvedValue([
      { name: 'Architecture Overview', path: 'docs/architecture.md', category: 'Core' }
    ] as never);
    vi.mocked(api.fetchDesignDocContent).mockResolvedValue({ content: '# Architecture Overview' });

    render(<DesignDocsPage />);

    expect(screen.getByText(/Design Docs & Projects/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText(/Architecture Overview/i)[0]).toBeInTheDocument();
    });
  });

  it('switches to Project Board tab', async () => {
    vi.mocked(api.fetchDesignDocs).mockResolvedValue([]);

    render(<DesignDocsPage />);

    await waitFor(() => {
      expect(screen.getByText(/Project Board/i)).toBeInTheDocument();
    });

    const boardTab = screen.getByText(/Project Board/i);
    fireEvent.click(boardTab);

    expect(screen.getByText(/In Progress/i)).toBeInTheDocument();
    expect(screen.getByText(/Auto Update Feature/i)).toBeInTheDocument();
  });
});
