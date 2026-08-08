import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TasksPage from './TasksPage';
import * as api from '../api';

vi.mock('../api');

describe('TasksPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without crashing', async () => {
    vi.mocked(api.listTasks).mockResolvedValue({ items: [] } as never);
    vi.mocked(api.listResearch).mockResolvedValue({ items: [] } as never);
    vi.mocked(api.fetchLogs).mockResolvedValue({ content: '' } as never);
    render(<TasksPage />);
    expect(screen.getByText(/Cognitive Dashboard/i)).toBeInTheDocument();
  });
});
