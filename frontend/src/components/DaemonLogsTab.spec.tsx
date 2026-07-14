import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DaemonLogsTab from './DaemonLogsTab';

describe('DaemonLogsTab', () => {
  it('renders logs correctly', () => {
    const testLogs = 'Log line 1\nLog line 2';
    render(<DaemonLogsTab logs={testLogs} activeTab="logs" />);

    expect(screen.getByText(/Cognitive Daemon Stream/i)).toBeInTheDocument();
    expect(screen.getByText(/Log line 1/i)).toBeInTheDocument();
    expect(screen.getByText(/Log line 2/i)).toBeInTheDocument();
  });

  it('renders without error when not active', () => {
    const testLogs = 'Log line 1\nLog line 2';
    render(<DaemonLogsTab logs={testLogs} activeTab="other" />);

    expect(screen.getByText(/Log line 1/i)).toBeInTheDocument();
  });
});
