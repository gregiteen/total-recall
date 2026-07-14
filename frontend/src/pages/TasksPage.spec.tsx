import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import TasksPage from './TasksPage';
import * as api from '../api';

vi.mock('../api');

describe('TasksPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without crashing', () => {
    render(<TasksPage />);
    expect(screen.getByText(/Cognitive Dashboard/i)).toBeInTheDocument();
  });
});
