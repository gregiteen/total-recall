import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import PluginsPage from './PluginsPage';

const installed = [{
  id: 'git-sentinel', name: 'Git Sentinel', version: '1.1.0', description: 'Repository state',
  author: 'Total Recall', license: 'MIT', homepage: null, use_cases: ['software-development'],
  valid: true, errors: [], scope: 'project', linked: false, dir: '/p/git-sentinel', shared: true,
  source: { kind: 'peer', ref: 'peer:mac-mini/git-sentinel', peer_hostname: 'mac-mini' },
  installed_at: '2026-09-22T12:00:00.000Z', sha256: 'a'.repeat(64), installed_sha256: 'a'.repeat(64),
  modified_since_install: false, file_count: 3, size_bytes: 2048, categories: [], tasks: [],
  openwiki_hubs: [], cli: { command: 'git-sentinel', subcommands: [{ name: 'audit' }] }, has_generator: false
}];

const bundled = [
  { id: 'git-sentinel', name: 'Git Sentinel', version: '1.1.0', description: 'Repository state', use_cases: ['software-development'], categories: [], tasks: [], cli: null, installed: true },
  { id: 'system-monitor', name: 'System Monitor', version: '1.1.0', description: 'Host resources', use_cases: ['operations'], categories: [], tasks: [{ intent: 'x', schedule: '*/15 * * * *', command: 'sample' }], cli: null, installed: false }
];

const peers = {
  mesh: { available: true, configured: true },
  peers: [
    { hostname: 'mac-mini', ip: '100.64.0.2', online: true, os: 'macOS', status: 'ok', plugins: [
      { id: 'reading-list', name: 'Reading List', version: '0.2.0', description: 'Papers to read', use_cases: ['research'], sha256: 'b'.repeat(64), file_count: 4, size_bytes: 900, installed: false, same_as_installed: false }
    ] },
    { hostname: 'droplet', ip: '100.64.0.1', online: true, os: 'linux', status: 'unsupported', error: 'Peer does not serve plugins (older Total Recall version)', plugins: [] }
  ]
};

const calls: Array<{ url: string; init?: RequestInit }> = [];

function respond(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
}

beforeEach(() => {
  calls.length = 0;
  globalThis.fetch = vi.fn((url: RequestInfo | URL, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith('/api/plugins/available')) return respond({ success: true, plugins: bundled });
    if (u.endsWith('/api/plugins/peers')) return respond({ success: true, ...peers });
    if (u.endsWith('/api/plugins/install')) return respond({ success: true, message: 'Installed System Monitor 1.1.0 (bundled)' });
    if (u.includes('/readme')) return respond({ success: true, readme: '# Git Sentinel' });
    if (u.endsWith('/api/plugins')) return respond({ success: true, count: 1, plugins: installed });
    return respond({}, 404);
  }) as unknown as typeof fetch;
});

function renderPage() {
  return render(<MemoryRouter><PluginsPage /></MemoryRouter>);
}

describe('PluginsPage', () => {
  it('renders installed plugins with provenance and no fabricated social proof', async () => {
    const { container } = renderPage();
    expect(screen.getByRole('heading', { name: /Plugins/i })).toBeInTheDocument();
    expect(await screen.findByText('from mac-mini')).toBeInTheDocument();
    expect(screen.getByText('shared')).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/★|rating|reviews?\b|installs\b|downloads?|verified/i);
  });

  it('installs a bundled plugin', async () => {
    renderPage();
    await screen.findByText('from mac-mini');
    fireEvent.click(screen.getByRole('tab', { name: /Bundled/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Install' }));
    await waitFor(() => expect(calls.some(c => c.url.endsWith('/api/plugins/install'))).toBe(true));
    const body = JSON.parse(String(calls.find(c => c.url.endsWith('/api/plugins/install'))!.init!.body));
    expect(body).toEqual({ source: 'system-monitor' });
  });

  it('shows what each mesh peer shares and reports peers it could not use', async () => {
    const { container } = renderPage();
    await screen.findByText('from mac-mini');
    fireEvent.click(screen.getByRole('tab', { name: /On the mesh/ }));
    expect(await screen.findByText('Reading List')).toBeInTheDocument();
    expect(screen.getByText(/no plugin sharing \(older version\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Install' }));
    await waitFor(() => {
      const req = calls.find(c => c.url.endsWith('/api/plugins/install'));
      expect(JSON.parse(String(req!.init!.body))).toEqual({ source: 'peer:mac-mini/reading-list' });
    });
    expect(container.textContent).not.toMatch(/★|rating|downloads?|verified/i);
  });

  it('filters by use case', async () => {
    renderPage();
    await screen.findByText('from mac-mini');
    fireEvent.click(screen.getByRole('tab', { name: /Bundled/ }));
    fireEvent.change(screen.getByLabelText('Filter by use case'), { target: { value: 'operations' } });
    expect(screen.getByText('System Monitor')).toBeInTheDocument();
    expect(screen.queryByText('Repository state')).not.toBeInTheDocument();
  });
});
