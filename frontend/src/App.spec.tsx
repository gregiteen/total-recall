import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import App from './App';
import * as api from './api';
import * as onboarding from './utils/onboarding';

vi.mock('./api', () => ({
  checkSession: vi.fn(),
  logout: vi.fn(),
  registerUnauthedCallback: vi.fn(),
  fetchHealth: vi.fn(),
  getApiBase: vi.fn(),
  setApiBase: vi.fn(),
  // App calls fetchPlugins() on mount. A mock module that omits it makes
  // vitest throw "No fetchPlugins export is defined on the ./api mock", which
  // unmounts the whole tree and left every assertion staring at an empty div.
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
vi.mock('./pages/PluginsPage', () => ({ default: () => <div data-testid="plugins-page" /> }));
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

    await waitFor(() => {
      // Sidebar should contain core memory and capabilities
      expect(screen.queryByText('Chat')).not.toBeInTheDocument();
      expect(screen.queryByText('Skills')).not.toBeInTheDocument();
      expect(screen.queryByText('IDEs')).not.toBeInTheDocument();
      expect(screen.getByText('Vault')).toBeInTheDocument();
      expect(screen.getByText('Rules')).toBeInTheDocument();
      expect(screen.getByText('Plugins')).toBeInTheDocument();
      // Default route / redirects to /memory when onboarding is complete
      expect(screen.getByTestId('memory-page')).toBeInTheDocument();
    });
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

    await waitFor(() => {
      expect(screen.getByTestId('plugins-page')).toBeInTheDocument();
    });
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
