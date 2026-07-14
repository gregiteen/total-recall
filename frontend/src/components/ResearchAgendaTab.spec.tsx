import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ResearchAgendaTab from './ResearchAgendaTab';
import * as api from '../api';

vi.mock('../api', () => ({
  patchResearch: vi.fn(),
  deleteResearch: vi.fn(),
  shareToApi: vi.fn(),
}));

describe('ResearchAgendaTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.confirm = vi.fn().mockReturnValue(true);
  });

  const defaultProps = {
    researchItems: [],
    loading: false,
    showResearchForm: false,
    setShowResearchForm: vi.fn(),
    researchTopic: '',
    setResearchTopic: vi.fn(),
    researchPriority: 'medium' as const,
    setResearchPriority: vi.fn(),
    researchNotes: '',
    setResearchNotes: vi.fn(),
    researchSubmitting: false,
    handleCreateResearch: vi.fn(),
    expandedResearchId: null,
    handleToggleExpand: vi.fn(),
    loadedDiscoveries: {},
    loadingNodeSlugs: {},
    refreshResearch: vi.fn(),
  };

  it('renders correctly with no data', () => {
    render(<ResearchAgendaTab {...defaultProps} />);
    expect(screen.getByText('Vector Research agenda')).toBeInTheDocument();
    expect(screen.getByText('No active research topics queued.')).toBeInTheDocument();
  });

  it('shows research form when showResearchForm is true', () => {
    render(<ResearchAgendaTab {...defaultProps} showResearchForm={true} />);
    expect(screen.getByPlaceholderText('e.g. Bun vs Node.js HTTP clustering performance benchmarks')).toBeInTheDocument();
  });

  it('renders research items', () => {
    const items = [
      {
        id: 'r1',
        topic: 'Test topic 1',
        status: 'pending' as const,
        priority: 'high' as const,
        notes: 'test note',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    render(<ResearchAgendaTab {...defaultProps} researchItems={items} />);
    
    expect(screen.getByText('Test topic 1')).toBeInTheDocument();
    expect(screen.getByText('test note')).toBeInTheDocument();
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('pending')).toBeInTheDocument();
  });

  it('expands item and allows steering', async () => {
    const items = [
      {
        id: 'r1',
        topic: 'Test topic 1',
        status: 'pending' as const,
        priority: 'high' as const,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    render(<ResearchAgendaTab {...defaultProps} researchItems={items} expandedResearchId="r1" />);
    
    // Check if expanded UI is present
    expect(screen.getByText('Cognitive Research Engine Progress')).toBeInTheDocument();

    // Click steer
    fireEvent.click(screen.getByText('🎯 Steer'));

    // Steer modal should appear
    expect(screen.getByText('🎯 Steer Research')).toBeInTheDocument();

    const textarea = screen.getByPlaceholderText(/Add direction/);
    fireEvent.change(textarea, { target: { value: 'New direction' } });

    fireEvent.click(screen.getByText('Submit'));

    await waitFor(() => {
      expect(api.patchResearch).toHaveBeenCalledWith('r1', { notes: 'New direction' });
    });
  });

  it('allows cancelling research', async () => {
    const items = [
      {
        id: 'r1',
        topic: 'Test topic 1',
        status: 'pending' as const,
        priority: 'high' as const,
        notes: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    ];

    render(<ResearchAgendaTab {...defaultProps} researchItems={items} expandedResearchId="r1" />);
    
    fireEvent.click(screen.getByText('❌ Cancel'));

    await waitFor(() => {
      expect(window.confirm).toHaveBeenCalled();
      expect(api.deleteResearch).toHaveBeenCalledWith('r1');
      expect(defaultProps.refreshResearch).toHaveBeenCalled();
    });
  });
});
