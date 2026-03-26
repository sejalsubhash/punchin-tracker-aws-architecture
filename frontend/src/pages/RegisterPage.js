import React, { useState, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './AuthPage.css';

const STEPS = ['Email OTP', 'Verify Email', 'Password & Face', 'Done'];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep]                   = useState(0);
  const [name, setName]                   = useState('');
  const [email, setEmail]                 = useState('');
  const [otp, setOtp]                     = useState('');
  const [password, setPassword]           = useState('');
  const [showPassword, setShowPassword]   = useState(false);
  const [confirm, setConfirm]             = useState('');
  const [showConfirm, setShowConfirm]     = useState(false);
  const [loading, setLoading]             = useState(false);
  const [error, setError]                 = useState('');
  const [info, setInfo]                   = useState('');
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [showCamera, setShowCamera]       = useState(false);
  const [cameraReady, setCameraReady]     = useState(false);

  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const setErr = (msg) => { setError(msg); setInfo(''); };
  const setInf = (msg) => { setInfo(msg);  setError(''); };
  const clearAll = () => { setError(''); setInfo(''); };

  // ── Step 0: Send OTP ──────────────────────────────────────────────────────
  const sendOTP = async () => {
    if (!name.trim())  return setErr('Please enter your full name');
    if (!email.trim()) return setErr('Please enter your email address');
    setLoading(true); clearAll();
    try {
      // Pre-register in Cognito to trigger verification email
      const res  = await fetch('/api/auth/send-otp-registration', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInf(`Verification code sent to ${email}`);
      setStep(1);
    } catch (err) { setErr(err.message); }
    finally { setLoading(false); }
  };

  // ── Step 1: Verify OTP ────────────────────────────────────────────────────
  const verifyOTP = async () => {
    if (!otp) return setErr('Please enter the verification code');
    setLoading(true); clearAll();
    try {
      const res  = await fetch('/api/auth/verify-email-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep(2);
    } catch (err) { setErr(err.message); }
    finally { setLoading(false); }
  };

  const resendOTP = async () => {
    setLoading(true); clearAll();
    try {
      const res  = await fetch('/api/auth/resend-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setInf('New code sent to your email!');
    } catch (err) { setErr(err.message); }
    finally { setLoading(false); }
  };

  // ── Camera ────────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    clearAll(); setCapturedPhoto(null); setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.oncanplay = () => { setCameraReady(true); videoRef.current.play(); };
        }
      }, 100);
      setShowCamera(true);
    } catch { setErr('Camera access denied. Please allow camera permission.'); }
  }, []);

  const stopCamera = useCallback(() => {
    if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
    if (videoRef.current) videoRef.current.srcObject = null;
    setShowCamera(false); setCameraReady(false);
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current; const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width = video.videoWidth || 640; canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0); ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.9));
    stopCamera();
  }, [stopCamera]);

  // ── Step 2: Set password + register face ──────────────────────────────────
  const completeRegistration = async () => {
    if (!password)            return setErr('Please set a password');
    if (password.length < 8)  return setErr('Password must be at least 8 characters');
    if (password !== confirm) return setErr('Passwords do not match');
    if (!capturedPhoto)       return setErr('Please capture your face photo');
    setLoading(true); clearAll();
    try {
      // 1. Register face with Rekognition
      const faceRes  = await fetch('/api/register-face', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, photo: capturedPhoto }),
      });
      const faceData = await faceRes.json();
      if (!faceRes.ok) throw new Error(faceData.error || 'Face registration failed');

      // 2. Complete registration — set password + save faceId
      const regRes  = await fetch('/api/auth/complete-registration', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, email, password,
          faceId:    faceData.faceId,
          facePhoto: capturedPhoto,
        }),
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.error);

      setStep(3);
    } catch (err) { setErr(err.message); }
    finally { setLoading(false); }
  };

  // ── Eye icon ──────────────────────────────────────────────────────────────
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
          <p className="auth-brand-sub">Create your account</p>
        </div>

        {/* Stepper */}
        <div className="stepper">
          {STEPS.map((s, i) => (
            <div key={s} className={`step-item ${i < step ? 'done' : ''} ${i === step ? 'active' : ''}`}>
              <div className="step-dot">{i < step ? '✓' : i + 1}</div>
              <span className="step-label">{s}</span>
              {i < STEPS.length - 1 && <div className={`step-line ${i < step ? 'done' : ''}`} />}
            </div>
          ))}
        </div>

        {error && <div className="auth-error">⚠️ {error}</div>}
        {info  && <div className="auth-success-msg">✅ {info}</div>}

        {/* ── Step 0: Name + Email ──────────────────────────────────────── */}
        {step === 0 && (
          <div className="auth-form animate-in">
            <p className="auth-desc">Enter your name and email. We'll send a verification code.</p>
            <div className="auth-field">
              <label>Full name</label>
              <input type="text" placeholder="Priya Patel" value={name}
                onChange={e => setName(e.target.value)} />
            </div>
            <div className="auth-field">
              <label>Email address</label>
              <input type="email" placeholder="you@company.com" value={email}
                onChange={e => setEmail(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && sendOTP()} />
            </div>
            <button className="auth-btn auth-btn--primary" onClick={sendOTP} disabled={loading}>
              {loading ? 'Sending OTP...' : 'Send Verification Code →'}
            </button>
            <p className="auth-footer">Already have an account? <Link to="/login">Sign in</Link></p>
          </div>
        )}

        {/* ── Step 1: OTP ───────────────────────────────────────────────── */}
        {step === 1 && (
          <div className="auth-form animate-in">
            <p className="auth-desc">Enter the 6-digit code sent to <strong>{email}</strong></p>
            <div className="auth-field">
              <label>Verification code</label>
              <input type="text" placeholder="123456" maxLength={6} value={otp}
                onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                onKeyDown={e => e.key === 'Enter' && verifyOTP()}
                className="otp-input" />
            </div>
            <button className="auth-btn auth-btn--primary" onClick={verifyOTP} disabled={loading}>
              {loading ? 'Verifying...' : 'Verify Email →'}
            </button>
            <button className="auth-btn auth-btn--ghost" onClick={resendOTP} disabled={loading}>
              Resend code
            </button>
            <button className="auth-btn auth-btn--ghost" onClick={() => { setStep(0); clearAll(); }}>
              ← Change email
            </button>
          </div>
        )}

        {/* ── Step 2: Password + Face ───────────────────────────────────── */}
        {step === 2 && (
          <div className="auth-form animate-in">
            <p className="auth-desc">Set your password and register your face for attendance verification.</p>
            <div className="auth-field">
              <label>Password (min 8 characters)</label>
              <div className="password-wrap">
                <input type={showPassword ? 'text' : 'password'}
                  placeholder="Min 8 characters" value={password}
                  onChange={e => setPassword(e.target.value)} />
                <EyeIcon show={showPassword} toggle={() => setShowPassword(p => !p)} />
              </div>
            </div>
            <div className="auth-field">
              <label>Confirm password</label>
              <div className="password-wrap">
                <input type={showConfirm ? 'text' : 'password'}
                  placeholder="Re-enter password" value={confirm}
                  onChange={e => setConfirm(e.target.value)} />
                <EyeIcon show={showConfirm} toggle={() => setShowConfirm(p => !p)} />
              </div>
            </div>

            {!showCamera && !capturedPhoto && (
              <button className="auth-btn auth-btn--outline" onClick={startCamera}>
                📷 Open Camera to Register Face
              </button>
            )}

            {showCamera && (
              <div className="auth-camera">
                <div className="video-wrap">
                  <video ref={videoRef} autoPlay playsInline muted
                    className={`camera-video ${cameraReady ? 'ready' : 'loading'}`}
                    style={{ transform: 'scaleX(-1)' }} />
                  {!cameraReady && (
                    <div className="camera-loading-overlay">
                      <div className="camera-spinner" /><span>Starting camera...</span>
                    </div>
                  )}
                  {cameraReady && (
                    <div className="face-guide">
                      <div className="face-oval" />
                      <span className="face-guide-text">Align face in oval</span>
                    </div>
                  )}
                </div>
                <div className="auth-camera-btns">
                  <button className="capture-btn" onClick={capturePhoto} disabled={!cameraReady}>
                    <span className="capture-btn-inner" />
                  </button>
                  <button className="cam-btn cam-btn--cancel" onClick={stopCamera}>Cancel</button>
                </div>
                <p className="camera-hint">Click button to capture photo</p>
              </div>
            )}

            {capturedPhoto && (
              <div className="face-preview">
                <img src={capturedPhoto} alt={name} className="face-preview-img" />
                <div className="face-preview-label">✅ Face captured</div>
                <button className="cam-btn cam-btn--retake"
                  onClick={() => { setCapturedPhoto(null); startCamera(); }}>
                  Retake Photo
                </button>
              </div>
            )}

            <button className="auth-btn auth-btn--primary" onClick={completeRegistration}
              disabled={loading || !capturedPhoto}>
              {loading ? 'Completing registration...' : 'Complete Registration →'}
            </button>
          </div>
        )}

        {/* ── Step 3: Success ───────────────────────────────────────────── */}
        {step === 3 && (
          <div className="auth-form animate-in auth-success">
            <div className="success-icon">🎉</div>
            <h2>Registration Submitted!</h2>
            <p>Your registration is <strong>pending admin approval</strong>.</p>
            <p>The admin has been notified and will review your request.</p>
            <p>You will receive an email once your account is approved or rejected.</p>
            <button className="auth-btn auth-btn--primary" onClick={() => navigate('/login')}>
              Go to Login →
            </button>
          </div>
        )}

        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  );
}