import React, { useState, useEffect, useRef, useCallback } from 'react';
import './MemberSelector.css';

const AVATAR_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#14b8a6',
];

function getInitials(name) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function MemberSelector({ members, selected, onSelect, loading }) {
  const [faceStatuses, setFaceStatuses]       = useState({});
  const [registeringFor, setRegisteringFor]   = useState(null);
  const [registerError, setRegisterError]     = useState(null);
  const [registerSuccess, setRegisterSuccess] = useState(null);
  const [showCamera, setShowCamera]           = useState(false);
  const [cameraReady, setCameraReady]         = useState(false);
  const [capturedPhoto, setCapturedPhoto]     = useState(null);

  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // ── Load face registration status for all members ──────────────────────────
  useEffect(() => {
    if (!members.length) return;
    members.forEach(async (name) => {
      try {
        const res  = await fetch(`/api/face-status/${encodeURIComponent(name)}`);
        const data = await res.json();
        setFaceStatuses(prev => ({ ...prev, [name]: data.registered }));
      } catch (e) {
        setFaceStatuses(prev => ({ ...prev, [name]: false }));
      }
    });
  }, [members]);

  // ── Start camera for registration ──────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setRegisterError(null);
    setCapturedPhoto(null);
    setCameraReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.oncanplay = () => {
            setCameraReady(true);
            videoRef.current.play();
          };
        }
      }, 100);
      setShowCamera(true);
    } catch (err) {
      setRegisterError('Camera access denied. Please allow camera permission.');
    }
  }, []);

  // ── Stop camera ────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setShowCamera(false);
    setCameraReady(false);
    setCapturedPhoto(null);
    setRegisteringFor(null);
    setRegisterError(null);
  }, []);

  // ── Capture photo ──────────────────────────────────────────────────────────
  const capturePhoto = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    canvas.width  = video.videoWidth  || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0);
    setCapturedPhoto(canvas.toDataURL('image/jpeg', 0.9));
  }, []);

  // ── Submit face registration ────────────────────────────────────────────────
  const submitRegistration = useCallback(async () => {
    if (!capturedPhoto || !registeringFor) return;
    setRegisterError(null);
    try {
      const res  = await fetch('/api/register-face', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name: registeringFor, photo: capturedPhoto }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');

      setFaceStatuses(prev => ({ ...prev, [registeringFor]: true }));
      setRegisterSuccess(`Face registered for ${registeringFor}!`);
      setTimeout(() => setRegisterSuccess(null), 4000);
      stopCamera();
    } catch (err) {
      setRegisterError(err.message);
    }
  }, [capturedPhoto, registeringFor, stopCamera]);

  if (loading) {
    return (
      <div className="member-section">
        <h2 className="section-title"><span className="title-icon">👥</span> Team Members</h2>
        <div className="member-grid">
          {[1,2,3,4,5,6].map(i => <div key={i} className="member-card skeleton" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="member-section">
      <h2 className="section-title">
        <span className="title-icon">👥</span> Team Members
        <span className="member-count">{members.length} members</span>
      </h2>

      {/* Success toast */}
      {registerSuccess && (
        <div className="reg-success animate-fade">✅ {registerSuccess}</div>
      )}

      <div className="member-grid">
        {members.map((name) => {
          const color      = getColor(name);
          const isSelected = selected === name;
          const isRegistered = faceStatuses[name];

          return (
            <div key={name} className={`member-card ${isSelected ? 'selected' : ''}`}
              style={isSelected ? { '--card-accent': color, borderColor: color } : { '--card-accent': color }}>

              {/* Registration status badge */}
              <div className={`face-badge ${isRegistered ? 'face-badge--ok' : 'face-badge--no'}`}
                title={isRegistered ? 'Face registered' : 'Face not registered'}>
                {isRegistered ? '✓' : '!'}
              </div>

              {/* Avatar — click to select */}
              <button className="member-select-btn" onClick={() => onSelect(isSelected ? null : name)}>
                <div className="member-avatar"
                  style={{ background: `${color}22`, color, border: `1.5px solid ${color}44` }}>
                  {getInitials(name)}
                </div>
                <div className="member-name">{name}</div>
                {isSelected && <div className="selected-check">✓</div>}
              </button>

              {/* Register face button */}
              <button
                className="register-face-btn"
                onClick={() => { setRegisteringFor(name); startCamera(); }}
                title={isRegistered ? 'Update face registration' : 'Register face for verification'}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                {isRegistered ? 'Update' : 'Register'}
              </button>
            </div>
          );
        })}
      </div>

      {/* Face registration camera modal */}
      {showCamera && registeringFor && (
        <div className="reg-modal animate-in">
          <div className="reg-modal-header">
            <span className="reg-modal-title">
              📷 Register face — <strong>{registeringFor}</strong>
            </span>
            <button className="camera-close" onClick={stopCamera}>✕</button>
          </div>

          <div className="reg-modal-body">
            {/* Left: camera or preview */}
            <div className="reg-camera-side">
              {!capturedPhoto ? (
                <>
                  <div className="video-wrap">
                    <video ref={videoRef} autoPlay playsInline muted
                      className={`camera-video ${cameraReady ? 'ready' : 'loading'}`}
                      style={{ transform: 'scaleX(-1)' }} />
                    {!cameraReady && (
                      <div className="camera-loading-overlay">
                        <div className="camera-spinner" />
                        <span>Starting camera...</span>
                      </div>
                    )}
                    {/* Face guide overlay */}
                    {cameraReady && (
                      <div className="face-guide">
                        <div className="face-oval" />
                        <span className="face-guide-text">Align your face in the oval</span>
                      </div>
                    )}
                  </div>
                  <button className="capture-btn" onClick={capturePhoto} disabled={!cameraReady}>
                    <span className="capture-btn-inner" />
                  </button>
                </>
              ) : (
                <>
                  <img src={capturedPhoto} alt="Preview" className="captured-img" />
                  <button className="cam-btn cam-btn--retake" onClick={() => setCapturedPhoto(null)}>
                    Retake
                  </button>
                </>
              )}
            </div>

            {/* Right: instructions */}
            <div className="reg-info-side">
              <div className="reg-tips">
                <div className="reg-tip-title">📋 Tips for best results</div>
                <ul className="reg-tip-list">
                  <li>Face the camera directly</li>
                  <li>Good lighting on your face</li>
                  <li>Remove sunglasses</li>
                  <li>Keep neutral expression</li>
                  <li>Only one person in frame</li>
                </ul>
              </div>

              {registerError && (
                <div className="reg-error">⚠️ {registerError}</div>
              )}

              {capturedPhoto && (
                <button className="cam-btn cam-btn--confirm" onClick={submitRegistration}>
                  Confirm Registration
                </button>
              )}

              <button className="cam-btn cam-btn--cancel" onClick={stopCamera}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Legend */}
      <div className="face-legend">
        <span className="legend-item">
          <span className="face-badge face-badge--ok" style={{position:'static',width:16,height:16,fontSize:'9px'}}>✓</span>
          Face registered
        </span>
        <span className="legend-item">
          <span className="face-badge face-badge--no" style={{position:'static',width:16,height:16,fontSize:'9px'}}>!</span>
          Not registered
        </span>
      </div>
    </div>
  );
}