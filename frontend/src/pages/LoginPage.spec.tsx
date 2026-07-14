import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LoginPage from './LoginPage';
import * as api from '../api';

vi.mock('../api');

describe('LoginPage', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('renders loading state initially while checking auth status', () => {
    // getAuthStatus will be pending
    vi.mocked(api.getAuthStatus).mockImplementation(() => new Promise(() => {}));
    
    render(<LoginPage onAuthenticated={() => {}} />);
    
    // Check for the spinner svg (not text, since there's no loading text)
    // The main form should not be visible yet
    expect(screen.queryByText(/Sign In/i)).not.toBeInTheDocument();
  });

  it('renders Welcome back if already configured', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue({ configured: true });
    
    render(<LoginPage onAuthenticated={() => {}} />);
    
    await waitFor(() => {
      expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
    });
    
    expect(screen.getByText(/Sign In/i)).toBeInTheDocument();
  });

  it('renders Setup Admin Password if not configured', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue({ configured: false });
    
    render(<LoginPage onAuthenticated={() => {}} />);
    
    await waitFor(() => {
      expect(screen.getByText(/Setup Admin Password/i)).toBeInTheDocument();
    });
    
    expect(screen.getByText(/Create Password & Continue/i)).toBeInTheDocument();
  });
  
  it('calls login api and triggers onAuthenticated on success', async () => {
    vi.mocked(api.getAuthStatus).mockResolvedValue({ configured: true });
    vi.mocked(api.login).mockResolvedValue({ ok: true });
    
    const onAuth = vi.fn();
    render(<LoginPage onAuthenticated={onAuth} />);
    
    await waitFor(() => {
      expect(screen.getByText(/Welcome back/i)).toBeInTheDocument();
    });
    
    // Type password
    const input = screen.getByLabelText(/Password/i);
    await userEvent.type(input, 'test-password');
    
    // Click submit
    const button = screen.getByText(/Sign In/i);
    await userEvent.click(button);
    
    await waitFor(() => {
      expect(api.login).toHaveBeenCalledWith('test-password');
      expect(onAuth).toHaveBeenCalled();
    });
  });
});
