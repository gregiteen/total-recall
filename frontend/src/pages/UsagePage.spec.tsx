import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
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
    } as never);

    vi.mocked(api.fetchConfigJson).mockResolvedValue({} as never);

    await act(async () => {
      render(<UsagePage />);
    });
    
    expect(await screen.findByText(/Token & Budget Statistics/i, undefined, { timeout: 4000 })).toBeInTheDocument();
  }, 10000);
});
