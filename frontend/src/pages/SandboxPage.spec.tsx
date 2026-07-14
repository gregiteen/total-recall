import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SandboxPage from './SandboxPage';
import * as api from '../api';

vi.mock('../api');

describe('SandboxPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.fetchConfig).mockResolvedValue('');
  });

  it('renders without crashing', () => {
    render(<SandboxPage />);
    expect(screen.getByText(/Code Sandbox & Design/i)).toBeInTheDocument();
  });

  it('can execute code and display output', async () => {
    vi.mocked(api.runSandbox).mockResolvedValue({ success: true, output: 'Hello from sandbox' });

    render(<SandboxPage />);
    const runBtn = screen.getByText(/Run Code/i);
    
    fireEvent.click(runBtn);
    
    expect(screen.getByText(/Running/i)).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.getByText('Hello from sandbox')).toBeInTheDocument();
    });
  });
});
