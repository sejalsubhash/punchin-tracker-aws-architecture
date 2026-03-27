import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AuthPage.css';

export default function LoginPage() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const { login }  = useAuth();

  // ── Where to redirect after login ─────────────────────────────────────────
  // If user came from /admin link → redirect back to /admin after login
  const from = location.state?.from || null;

  const [step, setStep]                   = useState('login'); // login | forgot | reset
  const [email, setEmail]                 = useState('');
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [forgotEmail, setForgotEmail]     = useState('');
  const [resetCode, setResetCode]         = useState('');
  const [newPassword, setNewPassword]     = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [success, setSuccess]             = useState('');

  const clearMessages = () => { setError(''); setSuccess(''); };

  // ── Login ──────────────────────────────────────────────────────────────────
  const handleLogin = async () => {
    if (!email || !password) return setError('Please enter your email and password');
    setLoading(true); clearMessages();
    try {
      const res  = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      login(data.user, data.token);

      // ── Redirect logic ───────────────────────────────────────────────────
      // 1. If user came from a specific page (e.g. /admin) → go back there
      // 2. If admin → go to /admin
      // 3. Normal user → go to /
      if (from) {
        navigate(from, { replace: true });
      } else if (data.user.role === 'admin') {
        navigate('/admin', { replace: true });
      } else {
        navigate('/', { replace: true });
      }

    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Forgot Password — send reset code ─────────────────────────────────────
  const handleForgotPassword = async () => {
    if (!forgotEmail) return setError('Please enter your email address');
    setLoading(true); clearMessages();
    try {
      const res  = await fetch('/api/auth/forgot-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: forgotEmail }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Reset code sent to your email!');
      setStep('reset');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Reset Password ─────────────────────────────────────────────────────────
  const handleResetPassword = async () => {
    if (!resetCode)   return setError('Please enter the reset code');
    if (!newPassword) return setError('Please enter a new password');
    if (newPassword.length < 8) return setError('Password must be at least 8 characters');
    setLoading(true); clearMessages();
    try {
      const res  = await fetch('/api/auth/reset-password', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email: forgotEmail, code: resetCode, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess('Password reset successfully! Please login with your new password.');
      setTimeout(() => { setStep('login'); clearMessages(); }, 2500);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // ── Eye icon ───────────────────────────────────────────────────────────────
  const EyeIcon = ({ show, toggle }) => (
    <button type="button" className="eye-btn" onClick={toggle} tabIndex={-1}>
      {show ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
          <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      ) : (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      )}
    </button>
  );

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">🕐</div>
          <h1 className="auth-brand-name">PUNCH<span>TRACKER</span></h1>
          <p className="auth-brand-sub">
            {step === 'login'  ? 'Sign in to your account' :
             step === 'forgot' ? 'Reset your password'     :
             'Enter your new password'}
          </p>
        </div>

        {/* Show banner if admin came from /admin link */}
        {from === '/admin' && step === 'login' && (
          <div className="auth-success-msg">
            🔐 Please login with your admin account to access the dashboard
          </div>
        )}

        {error   && <div className="auth-error">⚠️ {error}</div>}
        {success && <div className="auth-success-msg">✅ {success}</div>}

        {/* ── Login form ─────────────────────────────────────────────────── */}
        {step === 'login' && (
          <div className="auth-form animate-in">
            <div className="auth-field">
              <label>Email address</label>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <div className="password-wrap">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Your password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleLogin()}
                />
                <EyeIcon show={showPassword} toggle={() => setShowPassword(p => !p)} />
              </div>
            </div>
            <button
              className="forgot-link"
              onClick={() => { setStep('forgot'); clearMessages(); setForgotEmail(email); }}>
              Forgot password?
            </button>
            <button
              className="auth-btn auth-btn--primary"
              onClick={handleLogin}
              disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
            <p className="auth-footer">
              Don't have an account? <Link to="/register">Register</Link>
            </p>
          </div>
        )}

        {/* ── Forgot Password form ───────────────────────────────────────── */}
        {step === 'forgot' && (
          <div className="auth-form animate-in">
            <p className="auth-desc">
              Enter your registered email. We'll send a reset code to your inbox.
            </p>
            <div className="auth-field">
              <label>Email address</label>
              <input
                type="email"
                placeholder="you@company.com"
                value={forgotEmail}
                onChange={e => setForgotEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleForgotPassword()}
              />
            </div>
            <button
              className="auth-btn auth-btn--primary"
              onClick={handleForgotPassword}
              disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Code →'}
            </button>
            <button
              className="auth-btn auth-btn--ghost"
              onClick={() => { setStep('login'); clearMessages(); }}>
              ← Back to login
            </button>
          </div>
        )}

        {/* ── Reset Password form ────────────────────────────────────────── */}
        {step === 'reset' && (
          <div className="auth-form animate-in">
            <p className="auth-desc">
              Enter the code sent to <strong>{forgotEmail}</strong> and your new password.
            </p>
            <div className="auth-field">
              <label>Reset code</label>
              <input
                type="text"
                placeholder="Enter code from email"
                maxLength={6}
                value={resetCode}
                onChange={e => setResetCode(e.target.value.replace(/\D/g, ''))}
                className="otp-input"
              />
            </div>
            <div className="auth-field">
              <label>New password</label>
              <div className="password-wrap">
                <input
                  type={showNewPassword ? 'text' : 'password'}
                  placeholder="Min 8 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
                />
                <EyeIcon show={showNewPassword} toggle={() => setShowNewPassword(p => !p)} />
              </div>
            </div>
            <button
              className="auth-btn auth-btn--primary"
              onClick={handleResetPassword}
              disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password →'}
            </button>
            <button
              className="auth-btn auth-btn--ghost"
              onClick={() => { setStep('forgot'); clearMessages(); }}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}