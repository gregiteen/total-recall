import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import OkfPage from './OkfPage';
import * as api from '../api';

vi.mock('../api');

describe('OkfPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly on Import tab', () => {
    render(<OkfPage />);
    expect(screen.getAllByText(/Open Knowledge Format/i)[0]).toBeInTheDocument();
    expect(screen.getByText(/Import Open Knowledge Format bundles/i)).toBeInTheDocument();
  });

  it('switches to Export tab', () => {
    render(<OkfPage />);
    const exportTab = screen.getByText(/⬆ Export/i);
    fireEvent.click(exportTab);
    expect(screen.getByText(/Export your memory vault/i)).toBeInTheDocument();
  });

  it('switches to Lint tab and runs lint', async () => {
    vi.mocked(api.runSandbox).mockResolvedValue({
      success: true,
      output: JSON.stringify([{ slug: 'test', field: 'body', severity: 'error', message: 'test error' }])
    });

    render(<OkfPage />);
    
    const lintTab = screen.getByText(/🔍 Lint/i);
    fireEvent.click(lintTab);

    const runBtn = screen.getByText(/Run Compliance Check/i);
    fireEvent.click(runBtn);

    await waitFor(() => {
      expect(api.runSandbox).toHaveBeenCalled();
      expect(screen.getByText(/test error/i)).toBeInTheDocument();
      expect(screen.getByText(/Errors: 1/i)).toBeInTheDocument();
    });
  });
});
