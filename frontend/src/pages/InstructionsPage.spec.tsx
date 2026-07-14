import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import InstructionsPage from './InstructionsPage';
import * as api from '../api';

vi.mock('../api');

describe('InstructionsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders correctly and loads surfaces', async () => {
    vi.mocked(api.fetchInstructions).mockResolvedValue({
      surfaces: [
        { name: 'AGENTS.md', filename: 'AGENTS.md', size: 1024, lastCompiled: new Date().toISOString(), active: true }
      ],
      lastCompileTimestamp: new Date().toISOString(),
      totalNodes: 10
    } as any);

    vi.mocked(api.fetchInstructionContent).mockResolvedValue({ content: '# AGENTS\n\nRule 1' } as any);

    render(<InstructionsPage />);

    expect(screen.getByText(/Instruction Surfaces/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText(/AGENTS.md/i)).toBeInTheDocument();
    });
  });

  it('handles compilation', async () => {
    vi.mocked(api.fetchInstructions).mockResolvedValue({
      surfaces: [],
      lastCompileTimestamp: new Date().toISOString(),
      totalNodes: 0
    } as any);

    vi.mocked(api.triggerRecompile).mockResolvedValue({ message: 'Success' });

    render(<InstructionsPage />);

    const recompileBtn = screen.getByText(/Recompile All/i);
    fireEvent.click(recompileBtn);

    await waitFor(() => {
      expect(api.triggerRecompile).toHaveBeenCalled();
      expect(screen.getByText(/Success/i)).toBeInTheDocument();
    });
  });
});
