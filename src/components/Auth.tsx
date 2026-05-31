import React, { useState } from 'react';
import { dbService } from '../services/db';
import type { UserProfile } from '../services/db';
import { CalendarDays, ShieldAlert, ArrowRight, Sparkles } from 'lucide-react';

interface AuthProps {
  onAuthSuccess: (user: UserProfile) => void;
}

export const Auth: React.FC<AuthProps> = ({ onAuthSuccess }) => {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      const user = await dbService.loginWithGoogle();
      onAuthSuccess(user);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Google Sign-In failed');
    } finally {
      setLoading(false);
    }
  };

  const handleBypassDemo = () => {
    setError(null);
    setLoading(true);
    try {
      const demoUser: UserProfile = {
        uid: 'demo-user-123',
        email: 'demo@timetable4.me',
        displayName: 'Demo Scholar',
      };
      localStorage.setItem('t4m_user', JSON.stringify(demoUser));
      dbService.clearMockData(); // Reset local storage database
      onAuthSuccess(demoUser);
    } catch (err: any) {
      setError('Failed to initialize local sandbox.');
    } finally {
      setLoading(false);
    }
  };

  const isFirebase = dbService.isFirebaseMode();

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ maxWidth: '400px' }}>
        <div className="auth-header" style={{ marginBottom: '1.75rem' }}>
          <CalendarDays className="auth-logo" size={56} style={{ color: 'var(--primary)', marginBottom: '0.75rem' }} />
          <h2 style={{ fontSize: '1.75rem', fontWeight: 700 }}>Timetable4me</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginTop: '0.25rem' }}>
            Smart Academic & Training Scheduler
          </p>
        </div>

        {error && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.2)',
              color: '#f87171',
              padding: '0.75rem 1rem',
              borderRadius: '8px',
              fontSize: '0.85rem',
              marginBottom: '1.25rem',
            }}
          >
            <ShieldAlert size={18} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '0.5rem' }}>
          {isFirebase ? (
            <>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '0.5rem' }}>
                Securely sign in with your student or professional Google account to synchronize your timetables.
              </p>

              <button
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="btn google-btn"
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  display: 'flex',
                  gap: '0.75rem',
                  justifyContent: 'center',
                  alignItems: 'center',
                  fontSize: '0.95rem',
                  boxShadow: 'var(--shadow-md)',
                  transition: 'transform var(--transition-fast)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = 'translateY(-1px)')}
                onMouseLeave={(e) => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <svg width="20" height="20" viewBox="0 0 18 18" style={{ flexShrink: 0 }}>
                  <path
                    fill="#4285F4"
                    d="M17.64 9.2c0-.63-.06-1.25-.16-1.84H9v3.47h4.84c-.21 1.12-.84 2.07-1.79 2.7v2.25h2.9c1.69-1.55 2.69-3.85 2.69-6.58z"
                  />
                  <path
                    fill="#34A853"
                    d="M9 18c2.43 0 4.47-.8 5.96-2.2l-2.9-2.25c-.8.54-1.84.87-3.06.87-2.35 0-4.34-1.58-5.05-3.72H.92v2.33C2.4 15.98 5.46 18 9 18z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M3.95 10.7c-.18-.54-.28-1.12-.28-1.7s.1-1.16.28-1.7V4.97H.92C.33 6.18 0 7.55 0 9s.33 2.82.92 4.03l3.03-2.33z"
                  />
                  <path
                    fill="#EA4335"
                    d="M9 3.58c1.32 0 2.5.45 3.44 1.35L15 2.4C13.46.99 11.43 0 9 0 5.46 0 2.4 2.02.92 4.97l3.03 2.33c.71-2.14 2.7-3.72 5.05-3.72z"
                  />
                </svg>
                <span style={{ fontWeight: 600 }}>Sign In with Google</span>
              </button>
            </>
          ) : (
            <div
              style={{
                textAlign: 'center',
                padding: '1.25rem',
                backgroundColor: 'rgba(245, 158, 11, 0.08)',
                border: '1px solid rgba(245, 158, 11, 0.2)',
                borderRadius: '10px',
                fontSize: '0.85rem',
                color: '#fbbf24',
                lineHeight: '1.5',
              }}
            >
              Firebase environment configurations are currently offline. Connect database or continue with Sandbox local testing.
            </div>
          )}

          <div className="auth-divider" style={{ margin: '1.5rem 0 1rem' }}>Local Environment</div>

          <button
            onClick={handleBypassDemo}
            className="btn btn-secondary"
            style={{
              width: '100%',
              display: 'flex',
              gap: '0.5rem',
              justifyContent: 'center',
              alignItems: 'center',
              borderStyle: 'dashed',
              borderColor: 'var(--primary-glow)',
              padding: '0.625rem',
              fontSize: '0.85rem',
            }}
          >
            <Sparkles size={14} className="logo-icon" />
            <span>Enter local Sandbox Mode</span>
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};
