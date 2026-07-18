import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { LatencySparkline } from './LatencySparkline';

describe('LatencySparkline', () => {
  it('shows placeholder when fewer than 2 samples', () => {
    const { container } = render(<LatencySparkline values={[12]} />);
    expect(container.textContent).toContain('—');
  });

  it('renders polyline when enough samples', () => {
    render(<LatencySparkline values={[10, 20, 15, 30]} title="peer rtt" />);
    expect(screen.getByTestId('latency-sparkline')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /peer rtt|latency trend/i })).toBeInTheDocument();
  });
});
