import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobilePairing } from './MobilePairing';

describe('MobilePairing', () => {
  beforeEach(() => {
    // Mock window.location
    vi.stubGlobal('location', {
      protocol: 'http:',
      host: '192.168.1.100:3000'
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders instructions and QR code', () => {
    render(<MobilePairing />);
    expect(screen.getByText('Mobile Device Pairing')).toBeInTheDocument();
    expect(screen.getByText(/Scan this QR code/)).toBeInTheDocument();
    expect(screen.getByText('URL: http://192.168.1.100:3000')).toBeInTheDocument();
  });
});
