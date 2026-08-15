import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SkillsPage from './SkillsPage';
import * as api from '../api';

vi.mock('../api');

describe('SkillsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.listSkills).mockResolvedValue([
      { id: 'test-skill', name: 'test-skill', repo: 'test', source: 'A test skill' },
    ]);
  });

  it('renders without crashing', () => {
    render(<SkillsPage activeBrainId="global" />);
    expect(screen.getByText(/Skills Manager/i)).toBeInTheDocument();
  });
});
