import { useState, useEffect } from 'react';
import { AuthView } from './components/AuthView';
import { Dashboard } from './components/Dashboard';
import { Sandbox } from './components/Sandbox';

function App() {
  const [token, setToken] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [view, setView] = useState<'login' | 'dashboard' | 'sandbox'>('login');

  useEffect(() => {
    const savedToken = localStorage.getItem('collab_token');
    const savedUser = localStorage.getItem('collab_username');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUsername(savedUser);
      setView('dashboard');
    }
  }, []);

  const handleAuthSuccess = (newToken: string, newUsername: string) => {
    localStorage.setItem('collab_token', newToken);
    localStorage.setItem('collab_username', newUsername);
    setToken(newToken);
    setUsername(newUsername);
    setView('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('collab_token');
    localStorage.removeItem('collab_username');
    setToken(null);
    setUsername(null);
    setView('login');
  };

  return (
    <>
      <header style={{ borderBottom: '1px solid var(--border-light)', padding: '16px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'rgba(10, 11, 16, 0.4)', backdropFilter: 'blur(10px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: 'linear-gradient(135deg, var(--color-primary), var(--color-secondary))', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '18px', color: '#fff' }}>
            R
          </div>
          <span style={{ fontSize: '18px', fontWeight: '700', fontFamily: 'var(--font-display)', letterSpacing: '0.5px' }}>
            Total Recall Collab
          </span>
        </div>
        {token && (
          <div style={{ display: 'flex', gap: '8px', fontSize: '13px', color: 'var(--text-muted)' }}>
            <span>Signed in as:</span>
            <strong style={{ color: 'var(--text-bright)' }}>{username}</strong>
          </div>
        )}
      </header>

      <main style={{ minHeight: 'calc(100vh - 180px)', paddingBottom: '60px' }}>
        {view === 'login' && <AuthView onAuthSuccess={handleAuthSuccess} />}
        {view === 'dashboard' && token && username && (
          <Dashboard
            token={token}
            username={username}
            onLogout={handleLogout}
            onSelectSandbox={() => setView('sandbox')}
          />
        )}
        {view === 'sandbox' && token && username && (
          <Sandbox
            token={token}
            username={username}
            onBackToDashboard={() => setView('dashboard')}
          />
        )}
      </main>

      <footer style={{ borderTop: '1px solid var(--border-light)', padding: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--text-muted)', background: 'rgba(10, 11, 16, 0.6)' }}>
        <p>© 2026 Total Recall Sovereign OS Project. Local encryption, zero third-party tracking.</p>
      </footer>
    </>
  );
}

export default App;
