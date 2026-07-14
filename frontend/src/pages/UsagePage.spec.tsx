import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import UsagePage from './UsagePage';
import * as api from '../api';

vi.mock('../api');

describe('UsagePage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders without crashing', async () => {
    vi.mocked(api.fetchUsageStats).mockResolvedValue({
      dailyUsd: 1.0,
      weeklyUsd: 5.0,
      breakdown: {
        gemini: { dailyUsd: 1.0, weeklyUsd: 5.0, dailyTokens: 100, weeklyTokens: 500 }
      }
    } as any);

    vi.mocked(api.fetchConfigJson).mockResolvedValue({} as any);

    render(<UsagePage />);
    
    // Shows loading initially
    expect(screen.getByText(/Aggregating token expenditures/i)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByText(/Aggregating token expenditures/i)).not.toBeInTheDocument();
    });

    expect(screen.getByText(/Token & Budget Statistics/i)).toBeInTheDocument();
  });
});
