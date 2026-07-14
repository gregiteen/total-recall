import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import SkillsPage from './SkillsPage';
import * as api from '../api';

vi.mock('../api');

describe('SkillsPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(api.listSkills).mockResolvedValue([
      { name: 'test-skill', description: 'A test skill', repo: 'test' }
    ]);
  });

  it('renders without crashing', () => {
    render(<SkillsPage activeBrainId="global" />);
    expect(screen.getByText(/Skills Manager/i)).toBeInTheDocument();
  });
});
