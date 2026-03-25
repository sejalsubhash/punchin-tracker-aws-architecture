import React, { useState, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './AuthPage.css';

const STEPS = ['Your Details', 'Register Face', 'Verify Email', 'Done'];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep]               = useState(0);
  const [name, setName]               = useState('');
  const [email, setEmail]             = useState('');
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [otp, setOtp]                 = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [registeredFaceId, setRegisteredFaceId] = useState(null);
  const [showCamera, setShowCamera]   = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);

  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const clearError = () => setError('');

  // Camera functions
  const startCamera = useCallback(async () => {
    clearError(); setCapturedPhoto(null); setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false,
      });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.oncanplay = () => { setCameraReady(true); videoRef.current.play(); };
        }
      }, 100);
      setShowCamera(true);
    } catch { setError('Camera access denied. Please allow camera permission.'); }
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
  }, []);

  // Step 1 — Register face + submit to Cognito
  const registerAndSubmit = async () => {
    if (!name)     return setError('Please enter your full name');
    if (!email)    return setError('Please enter your email');
    if (!password) return setError('Please enter a password');
    if (password !== confirm) return setError('Passwords do not match');
    if (password.length < 8)  return setError('Password must be at least 8 characters');
    if (!capturedPhoto) return setError('Please capture your face photo first');
    setLoading(true); clearError();
    try {
      // Register face with Rekognition
      const faceRes  = await fetch('/api/register-face', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, photo: capturedPhoto }),
      });
      const faceData = await faceRes.json();
      if (!faceRes.ok) throw new Error(faceData.error || 'Face registration failed');
      setRegisteredFaceId(faceData.faceId);
      stopCamera();

      // Register with Cognito — Cognito sends OTP email automatically
      const regRes  = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, faceId: faceData.faceId }),
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.error);

      setStep(2); // Go to OTP verification step
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // Step 2 — Verify OTP from Cognito email
  const verifyOTP = async () => {
    if (!otp) return setError('Please enter the verification code');
    setLoading(true); clearError();
    try {
      const res  = await fetch('/api/auth/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep(3);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const resendCode = async () => {
    try {
      await fetch('/api/auth/resend-code', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setError('New code sent to your email!');
    } catch { setError('Failed to resend code'); }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">🕐</div>
          <h1 className="auth-brand-name">PUNCH<span>TRACKER</span></h1>
          <p className="auth-brand-sub">Create your account</p>
        </div>

        <div className="stepper">
          {STEPS.map((s, i) => (
            <div key={s} className={`step-item ${i < step ? 'done' : ''} ${i === step ? 'active' : ''}`}>
              <div className="step-dot">{i < step ? '✓' : i + 1}</div>
              <span className="step-label">{s}</span>
              {i < STEPS.length - 1 && <div className={`step-line ${i < step ? 'done' : ''}`} />}
            </div>
          ))}
        </div>

        {error && <div className={`auth-error ${error.includes('sent') ? 'auth-info' : ''}`}>
          {error.includes('sent') ? 'ℹ️' : '⚠️'} {error}
        </div>}

        {/* Step 0 — Details + Face */}
        {step === 0 && (
          <div className="auth-form animate-in">
            <p className="auth-desc">Fill in your details and register your face for attendance verification.</p>
            <div className="auth-field">
              <label>Full name</label>
              <input type="text" placeholder="Priya Patel" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="auth-field">
              <label>Email address</label>
              <input type="email" placeholder="you@company.com" value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="auth-field">
              <label>Password (min 8 characters)</label>
              <input type="password" placeholder="Min 8 characters" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
            <div className="auth-field">
              <label>Confirm password</label>
              <input type="password" placeholder="Re-enter password" value={confirm} onChange={e => setConfirm(e.target.value)} />
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
                  {!cameraReady && <div className="camera-loading-overlay"><div className="camera-spinner" /><span>Starting camera...</span></div>}
                  {cameraReady && <div className="face-guide"><div className="face-oval" /><span className="face-guide-text">Align face in oval</span></div>}
                </div>
                <div className="auth-camera-btns">
                  <button className="capture-btn" onClick={capturePhoto} disabled={!cameraReady}><span className="capture-btn-inner" /></button>
                  <button className="cam-btn cam-btn--cancel" onClick={stopCamera}>Cancel</button>
                </div>
              </div>
            )}

            {capturedPhoto && (
              <div className="face-preview">
                <img src={capturedPhoto} alt={name} className="face-preview-img" />
                <div className="face-preview-label">✅ Face captured</div>
                <button className="cam-btn cam-btn--retake" onClick={() => { setCapturedPhoto(null); startCamera(); }}>Retake</button>
              </div>
            )}

            <button className="auth-btn auth-btn--primary" onClick={registerAndSubmit}
              disabled={loading || !capturedPhoto}>
              {loading ? 'Registering...' : 'Register & Continue →'}
            </button>
            <p className="auth-footer">Already have an account? <Link to="/login">Sign in</Link></p>
          </div>
        )}

        {/* Step 2 — Verify OTP from Cognito email */}
        {step === 2 && (
          <div className="auth-form animate-in">
            <p className="auth-desc">
              AWS has sent a verification code to <strong>{email}</strong>. Enter it below.
            </p>
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
            <button className="auth-btn auth-btn--ghost" onClick={resendCode}>
              Resend code
            </button>
          </div>
        )}

        {/* Step 3 — Success */}
        {step === 3 && (
          <div className="auth-form animate-in auth-success">
            <div className="success-icon">🎉</div>
            <h2>Registration Complete!</h2>
            <p>Your email is verified.</p>
            <p>Your account is <strong>pending admin approval</strong>.</p>
            <p>You will receive an email once approved.</p>
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