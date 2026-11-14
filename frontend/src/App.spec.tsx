import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import App from './App';
import * as api from './api';
import * as onboarding from './utils/onboarding';

vi.mock('./api', async importOriginal => {
  const actual = await importOriginal<typeof import('./api')>();
  return {
    ...actual,
    checkSession: vi.fn(),
    logout: vi.fn(),
    registerUnauthedCallback: vi.fn(),
    fetchHealth: vi.fn().mockResolvedValue({ status: 'ok', daemon: 'running', version: '3.46.2', uptime: 120, authMode: 'session' }),
    getApiBase: vi.fn(),
    setApiBase: vi.fn(),
  };
});

vi.mock('./api/memory', () => ({
  fetchVaultStatus: vi.fn().mockResolvedValue({ totalNodes: 42, categories: { knowledge: 30, decision: 12 }, embeddings: 42, lastCompiled: '' }),
  fetchMemoryStats: vi.fn().mockResolvedValue({ total: 42, byCategory: { knowledge: 30, decision: 12 } }),
}));

vi.mock('./api/mesh', () => ({
  fetchNodes: vi.fn().mockResolvedValue([]),
  fetchLeader: vi.fn().mockResolvedValue(null),
}));

vi.mock('./api/plugins', async importOriginal => ({
  ...await importOriginal<typeof import('./api/plugins')>(),
  fetchPlugins: vi.fn().mockResolvedValue([]),
}));

vi.mock('./utils/onboarding', () => ({
  isOnboardingComplete: vi.fn(),
}));

// Mock the components since App contains a lot of them and we just want to test routing/auth logic
vi.mock('./pages/LoginPage', () => ({
  default: ({ onAuthenticated }: { onAuthenticated: () => void }) => <div data-testid="login-page"><button onClick={onAuthenticated}>Login</button></div>
}));
vi.mock('./pages/MemoryPage', () => ({ default: () => <div data-testid="memory-page" /> }));
vi.mock('./pages/SettingsPage', () => ({ default: () => <div data-testid="settings-page" /> }));
vi.mock('./pages/TasksPage', () => ({ default: () => <div data-testid="tasks-page" /> }));
vi.mock('./components/BrainSelector', () => ({ default: () => <div data-testid="brain-selector" /> }));
vi.mock('./pages/HelpPage', () => ({ default: () => <div data-testid="help-page" /> }));
vi.mock('./pages/GraphPage', () => ({ default: () => <div data-testid="graph-page" /> }));
vi.mock('./pages/OnboardingPage', () => ({ default: () => <div data-testid="onboarding-page" /> }));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/');
  });

  it('renders loading state initially', () => {
    vi.mocked(api.checkSession).mockImplementation(() => new Promise(() => {})); // Never resolves
    render(<App />);
    expect(document.querySelector('svg')).toBeInTheDocument(); // Loading spinner
  });

  it('renders login page if unauthed', async () => {
    vi.mocked(api.checkSession).mockResolvedValue(false);
    render(<App />);
    
    await waitFor(() => {
      expect(screen.getByTestId('login-page')).toBeInTheDocument();
    });
  });

  it('renders app layout if authed', async () => {
    vi.mocked(api.checkSession).mockResolvedValue(true);
    vi.mocked(onboarding.isOnboardingComplete).mockReturnValue(true);
    render(<App />);

    const handle = await screen.findByRole('button', { name: 'Workspace navigation' });
    expect(handle).toHaveAttribute('aria-expanded', 'false');
    const header = screen.getByRole('banner', { name: 'Dashboard' });
    expect(within(header).getByRole('img', { name: 'Total Recall' })).toBeVisible();
    fireEvent.click(handle);
    expect(screen.getByRole('button', { name: 'Plugins' })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Memory', { selector: 'summary' }));
    await waitFor(() => {
      expect(screen.queryByText('Chat')).not.toBeInTheDocument();
      expect(screen.queryByText('Skills')).not.toBeInTheDocument();
      expect(screen.queryByText('IDEs')).not.toBeInTheDocument();
      expect(screen.getByText('Vault')).toBeInTheDocument();
      expect(within(screen.getByRole('navigation', { name: 'Workspace' })).getByText('Rules')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Plugins' })).toBeInTheDocument();
      // Default route / renders the Main Dashboard status overview when onboarding is complete
      expect(screen.getByRole('region', { name: 'Main dashboard' })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Account', { selector: 'summary' }));
    const accountNav = screen.getByRole('navigation', { name: 'Account' });
    expect(within(accountNav).getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(within(accountNav).getByRole('button', { name: 'Sign out' })).toBeInTheDocument();
    expect(within(accountNav).queryByRole('link', { name: 'Setup guide' })).not.toBeInTheDocument();
    expect(within(accountNav).queryByTestId('network-gate-indicator')).not.toBeInTheDocument();
    expect(within(accountNav).queryByRole('link', { name: 'Mesh' })).not.toBeInTheDocument();
    expect(within(accountNav).queryByRole('link', { name: 'Secrets & Keys' })).not.toBeInTheDocument();
    expect(within(accountNav).queryByRole('link', { name: 'Notifications' })).not.toBeInTheDocument();
  });

  it('redirects /chat to /memory', async () => {
    window.history.replaceState({}, '', '/chat');
    vi.mocked(api.checkSession).mockResolvedValue(true);
    vi.mocked(onboarding.isOnboardingComplete).mockReturnValue(true);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('memory-page')).toBeInTheDocument();
    });
  });

  it('redirects /integrations to meta-harness plugin', async () => {
    window.history.replaceState({}, '', '/integrations');
    vi.mocked(api.checkSession).mockResolvedValue(true);
    vi.mocked(onboarding.isOnboardingComplete).mockReturnValue(true);
    render(<App />);

    await waitFor(() => expect(window.location.search).toBe('?plugin=meta-harness'));
    expect(window.location.pathname).toBe('/memory');
    fireEvent.click(screen.getByRole('button', { name: 'Workspace navigation' }));
    expect(screen.getByRole('button', { name: 'Plugins' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('opens the legacy plugin link while onboarding', async () => {
    window.history.replaceState({}, '', '/plugins?id=mesh');
    vi.mocked(api.checkSession).mockResolvedValue(true);
    vi.mocked(onboarding.isOnboardingComplete).mockReturnValue(false);
    render(<App />);
    await waitFor(() => expect(window.location.pathname).toBe('/onboarding'));
    expect(window.location.search).toBe('?plugin=mesh');
  });

  it('opens workspace navigation and closes it after selecting a page', async () => {
    window.history.replaceState({}, '', '/rules');
    vi.mocked(api.checkSession).mockResolvedValue(true);
    vi.mocked(onboarding.isOnboardingComplete).mockReturnValue(true);
    render(<App />);
    const toggle = await screen.findByRole('button', { name: 'Workspace navigation' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getByText('Memory', { selector: 'summary' }));
    fireEvent.click(screen.getByRole('link', { name: 'Vault' }));
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('closes an idle drawer and restores focus to its handle', async () => {
    vi.mocked(api.checkSession).mockResolvedValue(true);
    vi.mocked(onboarding.isOnboardingComplete).mockReturnValue(true);
    render(<App />);
    const toggle = await screen.findByRole('button', { name: 'Workspace navigation' });
    vi.useFakeTimers();
    try {
      fireEvent.click(toggle);
      screen.getByRole('button', { name: 'Plugins' }).focus();
      act(() => vi.advanceTimersByTime(5000));
      expect(toggle).toHaveAttribute('aria-expanded', 'false');
      expect(toggle).toHaveFocus();
    } finally {
      vi.useRealTimers();
    }
  });

  it('redirects to onboarding if not complete', async () => {
    vi.mocked(api.checkSession).mockResolvedValue(true);
    vi.mocked(onboarding.isOnboardingComplete).mockReturnValue(false);
    render(<App />);

    await waitFor(() => {
      expect(screen.getByTestId('onboarding-page')).toBeInTheDocument();
    });
  });
});
