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
}));

vi.mock('./utils/onboarding', () => ({
  isOnboardingComplete: vi.fn(),
}));

// Mock the components since App contains a lot of them and we just want to test routing/auth logic
vi.mock('./pages/LoginPage', () => ({
  default: ({ onAuthenticated }: any) => <div data-testid="login-page"><button onClick={onAuthenticated}>Login</button></div>
}));
vi.mock('./pages/ChatPage', () => ({ default: () => <div data-testid="chat-page" /> }));
vi.mock('./pages/MemoryPage', () => ({ default: () => <div data-testid="memory-page" /> }));
vi.mock('./pages/SettingsPage', () => ({ default: () => <div data-testid="settings-page" /> }));
vi.mock('./pages/TasksPage', () => ({ default: () => <div data-testid="tasks-page" /> }));
vi.mock('./pages/ApiKeysPage', () => ({ default: () => <div data-testid="apikeys-page" /> }));
vi.mock('./pages/IntegrationsPage', () => ({ default: () => <div data-testid="integrations-page" /> }));
vi.mock('./components/BrainSelector', () => ({ default: () => <div data-testid="brain-selector" /> }));
vi.mock('./pages/SkillsPage', () => ({ default: () => <div data-testid="skills-page" /> }));
vi.mock('./pages/HelpPage', () => ({ default: () => <div data-testid="help-page" /> }));
vi.mock('./pages/GraphPage', () => ({ default: () => <div data-testid="graph-page" /> }));
vi.mock('./pages/OpenWikiPage', () => ({ default: () => <div data-testid="openwiki-page" /> }));
vi.mock('./pages/OnboardingPage', () => ({ default: () => <div data-testid="onboarding-page" /> }));

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      // Sidebar should be present
      expect(screen.getByText('Chat')).toBeInTheDocument();
      expect(screen.getByText('Vault')).toBeInTheDocument();
      // Chat page is always rendered initially (floating or main)
      expect(screen.getByTestId('chat-page')).toBeInTheDocument();
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
