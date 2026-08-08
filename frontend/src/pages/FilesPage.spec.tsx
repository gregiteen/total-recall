import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import FilesPage from './FilesPage';
import * as api from '../api';

vi.mock('../api');

describe('FilesPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly and loads files', async () => {
    vi.mocked(api.listFiles).mockResolvedValue([
      { name: 'test.txt', size: 1024, modified: new Date().toISOString(), isDirectory: false }
    ] as never);
    vi.mocked(api.listSkills).mockResolvedValue([]);

    render(<FilesPage />);

    expect(screen.getByText(/Storage & Automations/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/test.txt/i)).toBeInTheDocument();
      expect(screen.getByText(/1 KB/i)).toBeInTheDocument();
    });
  });

  it('switches to Scripts Editor tab', async () => {
    vi.mocked(api.listFiles).mockResolvedValue([]);
    vi.mocked(api.listSkills).mockResolvedValue([]);
    vi.mocked(api.listScripts).mockResolvedValue([
      { name: 'test-script.mjs', size: 500, modified: new Date().toISOString(), isDirectory: false }
    ] as never);

    render(<FilesPage />);

    const scriptsTabBtn = screen.getByText(/Scripts Editor/i);
    fireEvent.click(scriptsTabBtn);

    await waitFor(() => {
      expect(api.listScripts).toHaveBeenCalled();
      expect(screen.getByText(/test-script.mjs/i)).toBeInTheDocument();
    });
  });
});
