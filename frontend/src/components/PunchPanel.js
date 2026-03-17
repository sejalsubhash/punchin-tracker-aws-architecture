import React, { useState, useRef, useCallback } from 'react';
import './PunchPanel.css';

const ACTIONS = [
  {
    id: 'punch-in',
    label: 'Punch In',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
        <polyline points="10 17 15 12 10 7" />
        <line x1="15" y1="12" x2="3" y2="12" />
      </svg>
    ),
    color: 'green',
    desc: 'Start your workday',
    requiresPhoto: true,
  },
  {
    id: 'break',
    label: 'Break',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
        <line x1="6" y1="1" x2="6" y2="4" />
        <line x1="10" y1="1" x2="10" y2="4" />
        <line x1="14" y1="1" x2="14" y2="4" />
      </svg>
    ),
    color: 'amber',
    desc: 'Take a short break',
    requiresPhoto: false,
  },
  {
    id: 'punch-out',
    label: 'Punch Out',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <polyline points="16 17 21 12 16 7" />
        <line x1="21" y1="12" x2="9" y2="12" />
      </svg>
    ),
    color: 'red',
    desc: 'End your workday',
    requiresPhoto: false,
  },
];

export default function PunchPanel({
  selectedMember,
  entryType,
  setEntryType,
  manualTime,
  setManualTime,
  manualDate,
  setManualDate,
  liveTime,
  onPunch,
  loading,
  lastAction,
}) {
  // ── Webcam state ────────────────────────────────────────────────────────────
  const [showCamera, setShowCamera]     = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraError, setCameraError]   = useState(null);
  const [capturing, setCapturing]       = useState(false);
  const [pendingAction, setPendingAction] = useState(null);

  const videoRef    = useRef(null);
  const canvasRef   = useRef(null);
  const streamRef   = useRef(null);

  const disabled = !selectedMember || loading;

  // ── Start webcam ────────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCapturedPhoto(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setShowCamera(true);
    } catch (err) {
      setCameraError('Camera access denied. Please allow camera permission and try again.');
      console.error('Camera error:', err);
    }
  }, []);

  // ── Stop webcam ─────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
    setCapturedPhoto(null);
    setPendingAction(null);
    setCameraError(null);
  }, []);

  // ── Capture photo from video ────────────────────────────────────────────────
  const capturePhoto = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    canvas.width  = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, 320, 240);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedPhoto(dataUrl);
  }, []);

  // ── Confirm and submit punch with photo ─────────────────────────────────────
  const confirmPunchWithPhoto = useCallback(async () => {
    if (!capturedPhoto || !pendingAction) return;
    setCapturing(true);
    await onPunch(pendingAction, capturedPhoto);
    setCapturing(false);
    stopCamera();
  }, [capturedPhoto, pendingAction, onPunch, stopCamera]);

  // ── Handle action button click ──────────────────────────────────────────────
  const handleActionClick = useCallback(async (actionId, requiresPhoto) => {
    if (!selectedMember) return;
    if (requiresPhoto) {
      setPendingAction(actionId);
      await startCamera();
    } else {
      await onPunch(actionId, null);
    }
  }, [selectedMember, startCamera, onPunch]);

  return (
    <div className="punch-panel">

      {/* Entry Mode Toggle */}
      <div className="entry-toggle-wrap">
        <span className="toggle-label">Entry Mode</span>
        <div className="entry-toggle">
          <button
            className={`toggle-btn ${entryType === 'auto' ? 'active' : ''}`}
            onClick={() => setEntryType('auto')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
            Auto
          </button>
          <button
            className={`toggle-btn ${entryType === 'manual' ? 'active' : ''}`}
            onClick={() => setEntryType('manual')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="17" y1="3" x2="7" y2="13" /><rect x="1" y="13" width="6" height="6" rx="1" /><path d="M14 3l7 7" />
            </svg>
            Manual
          </button>
        </div>
      </div>

      {/* Auto time display */}
      {entryType === 'auto' && (
        <div className="auto-time-display animate-fade">
          <div className="auto-time-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div>
            <div className="auto-time-value">{liveTime.time}</div>
            <div className="auto-time-date">{liveTime.date}</div>
          </div>
          <div className="auto-badge">LIVE</div>
        </div>
      )}

      {/* Manual inputs */}
      {entryType === 'manual' && (
        <div className="manual-inputs animate-in">
          <div className="input-group">
            <label className="input-label">Time</label>
            <input type="time" className="time-input" value={manualTime} onChange={(e) => setManualTime(e.target.value)} />
          </div>
          <div className="input-group">
            <label className="input-label">Date</label>
            <input type="date" className="time-input" value={manualDate} onChange={(e) => setManualDate(e.target.value)} />
          </div>
        </div>
      )}

      {/* No member prompt */}
      {!selectedMember && (
        <div className="select-prompt">Please select a team member first</div>
      )}

      {/* Action buttons */}
      <div className="action-buttons">
        {ACTIONS.map((action) => (
          <button
            key={action.id}
            className={`action-btn action-btn--${action.color} ${lastAction?.action === action.id ? 'just-used' : ''}`}
            onClick={() => handleActionClick(action.id, action.requiresPhoto)}
            disabled={disabled}
            title={action.desc}
          >
            <span className="action-icon">{action.icon}</span>
            <div className="action-label-wrap">
              <span className="action-label">
                {action.label}
                {action.requiresPhoto && (
                  <span className="camera-badge">📷 photo</span>
                )}
              </span>
              <span className="action-desc">{action.desc}</span>
            </div>
          </button>
        ))}
      </div>

      {/* Camera error */}
      {cameraError && (
        <div className="camera-error animate-fade">
          ⚠️ {cameraError}
        </div>
      )}

      {/* ── Webcam modal ──────────────────────────────────────────────────── */}
      {showCamera && (
        <div className="camera-modal animate-in">
          <div className="camera-header">
            <span className="camera-title">📷 Take your photo to punch in</span>
            <button className="camera-close" onClick={stopCamera}>✕</button>
          </div>

          {/* Video preview */}
          {!capturedPhoto && (
            <div className="camera-preview">
              <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
              <button className="capture-btn" onClick={capturePhoto}>
                <span className="capture-btn-inner" />
              </button>
              <p className="camera-hint">Click the button to capture your photo</p>
            </div>
          )}

          {/* Captured photo preview */}
          {capturedPhoto && (
            <div className="camera-preview">
              <img src={capturedPhoto} alt="Captured" className="captured-img" />
              <div className="camera-actions">
                <button className="cam-btn cam-btn--retake" onClick={() => setCapturedPhoto(null)}>
                  Retake
                </button>
                <button
                  className="cam-btn cam-btn--confirm"
                  onClick={confirmPunchWithPhoto}
                  disabled={capturing}
                >
                  {capturing ? 'Saving...' : 'Confirm Punch In'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Last action feedback */}
      {lastAction && (
        <div className={`last-action-badge animate-fade last-action--${lastAction.color}`}>
          <span>✓</span>
          <span>
            <strong>{lastAction.name}</strong> — {lastAction.label} at {lastAction.time}
            {lastAction.photoUrl && <span className="photo-saved"> · photo saved</span>}
          </span>
        </div>
      )}
    </div>
  );
}