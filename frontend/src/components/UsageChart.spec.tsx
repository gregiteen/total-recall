import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UsageChart } from './UsageChart';

// Mock recharts as it needs a real DOM with dimensions to render properly
vi.mock('recharts', () => {
  const OriginalRecharts = vi.importActual('recharts');
  return {
    ...OriginalRecharts,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
    BarChart: ({ children, data }: { children: React.ReactNode, data: unknown }) => (
      <div data-testid="bar-chart" data-data={JSON.stringify(data)}>
        {children}
      </div>
    ),
    Bar: () => <div data-testid="bar" />,
    XAxis: () => <div data-testid="xaxis" />,
    YAxis: () => <div data-testid="yaxis" />,
    Tooltip: () => <div data-testid="tooltip" />,
    Legend: () => <div data-testid="legend" />,
    CartesianGrid: () => <div data-testid="grid" />,
  };
});

describe('UsageChart', () => {
  const defaultProps = {
    usageData: null,
    geminiModels: [],
    claudeModels: [],
    openaiModels: []
  };

  it('renders nothing when usageData is null', () => {
    const { container } = render(<UsageChart {...defaultProps} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when timeseries is empty', () => {
    const { container } = render(<UsageChart {...defaultProps} usageData={{
      breakdown: { gemini: { cost: 0 }, claude: { cost: 0 }, codex: { cost: 0 } },
      timeseries: {}
    } as never} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders chart when data is provided', () => {
    const usageData = {
      breakdown: { gemini: { cost: 1 }, claude: { cost: 1 }, codex: { cost: 1 } },
      timeseries: {
        '2023-10-01': {
          'gemini-pro': { provider: 'gemini', cost: 1.5, input: 100, output: 50 },
          'claude-2': { provider: 'claude', cost: 2.0, input: 100, output: 50 }
        },
        '2023-10-02': {
          'gpt-4': { provider: 'codex', cost: 3.5, input: 100, output: 50 }
        }
      }
    };

    render(<UsageChart {...defaultProps} usageData={usageData as never} />);
    
    expect(screen.getByText('API Costs Over Time')).toBeInTheDocument();
    
    const chart = screen.getByTestId('bar-chart');
    expect(chart).toBeInTheDocument();
    
    const parsedData = JSON.parse(chart.getAttribute('data-data') || '[]');
    expect(parsedData).toHaveLength(2);
    
    // Test data transformation
    expect(parsedData[0]).toEqual({
      date: '10/01',
      gemini: 1.5,
      claude: 2.0,
      codex: 0,
      openrouter: 0,
      total: 3.5
    });
    
    expect(parsedData[1]).toEqual({
      date: '10/02',
      gemini: 0,
      claude: 0,
      codex: 3.5,
      openrouter: 0,
      total: 3.5
    });
  });
});
