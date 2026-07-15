import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Graph3D from './Graph3D';

// Mock the ForceGraph3D component completely so it doesn't run Three.js loops in jsdom
vi.mock('react-force-graph-3d', () => {
  return {
    default: () => <div data-testid="force-graph-3d" />
  };
});

describe('Graph3D', () => {
  beforeEach(() => {
    // Mock canvas methods
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      clearRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      fillText: vi.fn(),
      scale: vi.fn(),
      setLineDash: vi.fn(),
      createRadialGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn()
      }),
    });
    
    // Mock requestAnimationFrame
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((_cb) => {
      // Don't actually loop, just call once for coverage
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
  });

  const defaultProps = {
    threads: [],
    memoryNodes: [],
    researchItems: [],
    onOpenThread: vi.fn(),
    onGroundMemoryNode: vi.fn(),
    selectedGroundingNodes: []
  };

  it('renders controls and overlay', () => {
    render(<Graph3D {...defaultProps} />);

    expect(screen.getByText('Constellation')).toBeInTheDocument();
    expect(screen.getByText('Interactive Knowledge Network')).toBeInTheDocument();
  });

  it('toggles filters', () => {
    render(<Graph3D {...defaultProps} />);

    const researchCheckbox = screen.getByLabelText(/Research/i);
    expect(researchCheckbox).toBeChecked();

    fireEvent.click(researchCheckbox);
    expect(researchCheckbox).not.toBeChecked();
  });

  it('renders with data', () => {
    render(
      <Graph3D
        {...defaultProps}
        threads={[{ id: 't1', title: 'Thread 1', turns: 2, lastUpdated: new Date().toISOString() } as any]}
        memoryNodes={[{ slug: 'm1', title: 'Memory 1', category: 'facts', content: 'test', confidence: 0.9 } as any]}
        researchItems={[{ id: 'r1', topic: 'Research 1', status: 'active', created_at: new Date().toISOString() } as any]}
      />
    );

    // Threads are off by default in visibleTypes
    const threadsCheckbox = screen.getByLabelText(/Sessions/i);
    expect(threadsCheckbox).not.toBeChecked();
    
    // The nodes are rendered in canvas, so DOM wise we just check the filter counts
    expect(screen.getAllByText('2 items')[0]).toBeInTheDocument(); // 1 memory node + 1 research = 2 nodes (threads are hidden by default)
  });
});
