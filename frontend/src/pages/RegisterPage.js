import React, { useState, useRef, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import './AuthPage.css';

const STEPS = ['Email OTP', 'Your Details', 'Register Face', 'Done'];

export default function RegisterPage() {
  const navigate = useNavigate();
  const [step, setStep]               = useState(0);
  const [email, setEmail]             = useState('');
  const [otp, setOtp]                 = useState('');
  const [name, setName]               = useState('');
  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [loading, setLoading]         = useState(false);
  const [error, setError]             = useState('');
  const [faceId, setFaceId]           = useState(null);
  const [showCamera, setShowCamera]   = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);

  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const clearError = () => setError('');

  const sendOTP = async () => {
    if (!email) return setError('Please enter your email address');
    setLoading(true); clearError();
    try {
      const res  = await fetch('/api/auth/send-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, purpose: 'registration' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep(1);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const verifyOTP = async () => {
    if (!otp) return setError('Please enter the OTP');
    setLoading(true); clearError();
    try {
      const res  = await fetch('/api/auth/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep(2);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

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

  const registerFaceAndSubmit = async () => {
    if (!name)    return setError('Please enter your full name');
    if (!password) return setError('Please enter a password');
    if (password !== confirm) return setError('Passwords do not match');
    if (password.length < 6)  return setError('Password must be at least 6 characters');
    if (!capturedPhoto) return setError('Please capture your face photo');
    setLoading(true); clearError();
    try {
      // Register face with Rekognition
      const faceRes  = await fetch('/api/register-face', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, photo: capturedPhoto }),
      });
      const faceData = await faceRes.json();
      if (!faceRes.ok) throw new Error(faceData.error || 'Face registration failed');
      const registeredFaceId = faceData.faceId;
      setFaceId(registeredFaceId);
      stopCamera();

      // Register user account
      const regRes  = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, password, faceId: registeredFaceId }),
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.error);
      setStep(3);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
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

        {error && <div className="auth-error">⚠️ {error}</div>}

        {step === 0 && (
          <div className="auth-form animate-in">
            <p className="auth-desc">Enter your work email. We'll send you a 6-digit verification code.</p>
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
              {loading ? 'Verifying...' : 'Verify OTP →'}
            </button>
            <button className="auth-btn auth-btn--ghost" onClick={() => { setStep(0); setOtp(''); }}>
              ← Change email
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="auth-form animate-in">
            <p className="auth-desc">Fill in your details and register your face for attendance verification.</p>
            <div className="auth-field">
              <label>Full name</label>
              <input type="text" placeholder="Priya Patel" value={name} onChange={e => setName(e.target.value)} />
            </div>
            <div className="auth-field">
              <label>Password</label>
              <input type="password" placeholder="Min 6 characters" value={password} onChange={e => setPassword(e.target.value)} />
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
                <p className="camera-hint">Click button to capture photo</p>
              </div>
            )}

            {capturedPhoto && (
              <div className="face-preview">
                <img src={capturedPhoto} alt="Your face" className="face-preview-img" />
                <div className="face-preview-label">✅ Photo captured</div>
                <button className="cam-btn cam-btn--retake" onClick={() => { setCapturedPhoto(null); startCamera(); }}>Retake Photo</button>
              </div>
            )}

            <button className="auth-btn auth-btn--primary" onClick={registerFaceAndSubmit}
              disabled={loading || !capturedPhoto}>
              {loading ? 'Registering...' : 'Complete Registration →'}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="auth-form animate-in auth-success">
            <div className="success-icon">🎉</div>
            <h2>Registration Submitted!</h2>
            <p>Your account is <strong>pending admin approval</strong>.</p>
            <p>You will receive an email once your account is approved.</p>
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