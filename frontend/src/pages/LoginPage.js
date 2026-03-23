import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './AuthPage.css';

export default function LoginPage() {
  const navigate    = useNavigate();
  const { login }   = useAuth();
  const [step, setStep]         = useState(0); // 0=credentials, 1=otp
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp]           = useState('');
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  const clearError = () => setError('');

  // Step 1 — validate credentials + send OTP
  const sendOTP = async () => {
    if (!email || !password) return setError('Please enter your email and password');
    setLoading(true); clearError();
    try {
      // First send OTP (also validates user exists + approved)
      const res  = await fetch('/api/auth/send-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'login' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep(1);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // Step 2 — verify OTP + login
  const verifyAndLogin = async () => {
    if (!otp) return setError('Please enter the OTP');
    setLoading(true); clearError();
    try {
      const res  = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      login(data.user, data.token);

      // Redirect based on role
      if (data.user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">🕐</div>
          <h1 className="auth-brand-name">PUNCH<span>TRACKER</span></h1>
          <p className="auth-brand-sub">Sign in to your account</p>
        </div>

        {error && <div className="auth-error">⚠️ {error}</div>}

        {step === 0 && (
          <div className="auth-form animate-in">
            <div className="auth-field">
              <label>Email address</label>
              <input type="email" placeholder="you@company.com" value={email}
                onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <input type="password" placeholder="Your password" value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendOTP()} />
            </div>
            <button className="auth-btn auth-btn--primary" onClick={sendOTP} disabled={loading}>
              {loading ? 'Sending OTP...' : 'Continue →'}
            </button>
            <p className="auth-footer">
              Don't have an account? <Link to="/register">Register</Link>
            </p>
          </div>
        )}

        {step === 1 && (
          <div className="auth-form animate-in">
            <p className="auth-desc">
              Enter the 6-digit OTP sent to <strong>{email}</strong>
            </p>
            <div className="auth-field">
              <label>One-time password</label>
              <input type="text" placeholder="123456" maxLength={6} value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && verifyAndLogin()}
                className="otp-input" />
            </div>
            <button className="auth-btn auth-btn--primary" onClick={verifyAndLogin} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In →'}
            </button>
            <button className="auth-btn auth-btn--ghost" onClick={() => { setStep(0); setOtp(''); clearError(); }}>
              ← Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}