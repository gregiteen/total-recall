
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import AutomationsPage from './AutomationsPage';
import * as api from '../api';

vi.mock('../api');

describe('AutomationsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.listTasks).mockResolvedValue([]);
  });

  it('renders correctly and triggers dream cycle', async () => {
    vi.mocked(api.triggerDream).mockResolvedValue({ status: 'completed' } as never);

    render(<AutomationsPage />);

    expect(screen.getByText(/Automations & Cron Schedulers/i)).toBeInTheDocument();

    const dreamBtn = screen.getByText(/Run REM Sleep Now/i);
    fireEvent.click(dreamBtn);

    await waitFor(() => {
      expect(api.triggerDream).toHaveBeenCalled();
      expect(screen.getByText(/Dream consolidator complete! REM Consolidation cycle status: completed/i)).toBeInTheDocument();
    });
  });

  it('triggers recompilation', async () => {
    vi.mocked(api.triggerRecompile).mockResolvedValue({ message: 'Brain surfaces recompiled successfully!' } as never);

    render(<AutomationsPage />);

    const recompileBtn = screen.getByText(/Rebuild Indexes/i);
    fireEvent.click(recompileBtn);

    await waitFor(() => {
      expect(api.triggerRecompile).toHaveBeenCalled();
      expect(screen.getByText(/Brain surfaces recompiled successfully!/i)).toBeInTheDocument();
    });
  });

  it('enqueues a task', async () => {
    vi.mocked(api.createTask).mockResolvedValue({} as never);

    render(<AutomationsPage />);

    const targetInput = screen.getByPlaceholderText(/Audit security.yml files for weak configuration hashes/i);
    fireEvent.change(targetInput, { target: { value: 'Test Task' } });

    const submitBtn = screen.getByText(/Dispatch to Queue/i);
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(api.createTask).toHaveBeenCalledWith('fact-seeker', 'Test Task', '', 5);
      expect(screen.getByText(/Cognitive System 2 task successfully enqueued!/i)).toBeInTheDocument();
    });
  });
});
