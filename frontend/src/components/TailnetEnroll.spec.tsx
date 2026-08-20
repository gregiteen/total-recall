import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { TailnetEnroll } from './TailnetEnroll';

vi.mock('../api/mesh', () => ({
  fetchNodes: vi.fn(),
  fetchEnrollmentStatus: vi.fn(),
  mintPreAuthKey: vi.fn(),
}));
import { fetchNodes, fetchEnrollmentStatus, mintPreAuthKey } from '../api/mesh';

const node = (over = {}) => ({
  hostname: 'laptop', ip: '100.64.0.3', online: true, self: false, os: 'macOS', ...over,
});

describe('TailnetEnroll', () => {
  beforeEach(() => {
    vi.mocked(fetchNodes).mockResolvedValue([node(), node({ hostname: 'macmini', ip: '100.64.0.2', self: true })] as never);
    vi.mocked(fetchEnrollmentStatus).mockResolvedValue({ login_server: 'https://control.example.org' } as never);
    vi.mocked(mintPreAuthKey).mockResolvedValue({
      success: true,
      key: 'hskey-auth-TESTKEY',
      expiration: new Date(Date.now() + 60_000).toISOString(),
      reusable: false,
      ephemeral: true,
      ttl_minutes: 15,
      login_server: 'https://headscale.example.com',
    } as never);
  });

  it('shows the control server and phone steps BEFORE any key is minted', async () => {
    // The regression: instructions lived inside the `minted` branch behind a
    // collapsed <details>, so step one -- the URL you must enter on the phone
    // -- was invisible until a 15-minute countdown was already running.
    render(<TailnetEnroll />);
    expect(await screen.findByTestId('enroll-instructions')).toBeTruthy();
    expect((await screen.findByTestId('enroll-login-server')).textContent).toContain(
      'https://control.example.org',
    );
    expect(screen.getByText('On a phone (iOS)')).toBeTruthy();
    expect(mintPreAuthKey).not.toHaveBeenCalled();
  });

  it('takes the control server from config, not from a minted key', async () => {
    render(<TailnetEnroll />);
    await waitFor(() =>
      expect(screen.getByTestId('enroll-login-server').textContent).toContain('control.example.org'),
    );
    expect(fetchEnrollmentStatus).toHaveBeenCalled();
  });

  it('says what to do when no control server is configured', async () => {
    vi.mocked(fetchEnrollmentStatus).mockResolvedValue({ login_server: null } as never);
    render(<TailnetEnroll />);
    await waitFor(() =>
      expect(screen.getByTestId('enroll-login-server').textContent).toMatch(/not configured/i),
    );
  });

  it('keeps the Reset Keychain step visible — skipping it is why sign-in reverts to the public service', async () => {
    render(<TailnetEnroll />);
    expect(await screen.findByText(/Reset Keychain/i)).toBeTruthy();
  });

  it('lists mesh nodes', async () => {
    render(<TailnetEnroll />);
    await waitFor(() => expect(screen.getByTestId('enroll-node-list')).toHaveTextContent('laptop'));
    expect(screen.getByTestId('enroll-node-list')).toHaveTextContent('macmini');
  });

  it('mints a key and shows a QR to scan', async () => {
    render(<TailnetEnroll />);
    fireEvent.click(screen.getByTestId('enroll-mint'));
    await waitFor(() => expect(screen.getByTestId('enroll-qr').querySelector('svg')).toBeTruthy());
    expect(screen.getByTestId('enroll-copy')).toBeTruthy();
  });

  it('config wins over the minted key for the control server URL', async () => {
    // Deliberate precedence: the key echoes back whatever server issued it,
    // but config is the source of truth and is available before any mint.
    render(<TailnetEnroll />);
    fireEvent.click(screen.getByTestId('enroll-mint'));
    await waitFor(() => expect(screen.getByTestId('enroll-copy')).toBeTruthy());
    expect(screen.getByTestId('enroll-login-server')).toHaveTextContent('control.example.org');
  });

  it('passes the reusable and ephemeral choices through to the API', async () => {
    render(<TailnetEnroll />);
    fireEvent.click(screen.getByTestId('enroll-reusable'));
    fireEvent.click(screen.getByTestId('enroll-mint'));
    await waitFor(() => expect(mintPreAuthKey).toHaveBeenCalledWith({ reusable: true, ephemeral: false }));
  });

  // A key is a bearer credential with a short TTL; a dead one must not sit on
  // screen looking scannable.
  it('marks the key expired once its TTL has elapsed', async () => {
    vi.mocked(mintPreAuthKey).mockResolvedValue({
      success: true, key: 'hskey-auth-OLD', expiration: new Date(Date.now() - 1000).toISOString(),
      reusable: false, ephemeral: false, ttl_minutes: 15, login_server: 'https://headscale.example.com',
    } as never);
    render(<TailnetEnroll />);
    fireEvent.click(screen.getByTestId('enroll-mint'));
    await waitFor(() => expect(screen.getByTestId('enroll-ttl')).toHaveTextContent('expired'));
    expect(screen.getByTestId('enroll-qr')).toHaveTextContent('Key expired');
  });

  it('surfaces a mint failure instead of silently doing nothing', async () => {
    vi.mocked(mintPreAuthKey).mockRejectedValue(new Error('headscale unreachable'));
    render(<TailnetEnroll />);
    fireEvent.click(screen.getByTestId('enroll-mint'));
    await waitFor(() => expect(screen.getByTestId('tailnet-enroll-error')).toHaveTextContent('headscale unreachable'));
  });

  it('warns about nodes with no recorded login account', async () => {
    render(<TailnetEnroll />);
    await waitFor(() => expect(screen.getByTestId('enroll-access-warning')).toHaveTextContent('no recorded login account'));
  });
});
