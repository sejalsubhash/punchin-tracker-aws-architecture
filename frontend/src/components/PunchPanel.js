import React, { useState, useRef, useCallback, useEffect } from 'react';
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
  const [showCamera, setShowCamera]       = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState(null);
  const [cameraError, setCameraError]     = useState(null);
  const [capturing, setCapturing]         = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [cameraReady, setCameraReady]     = useState(false);

  const videoRef  = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const disabled = !selectedMember || loading;

  // ── Fix black screen: wait for video metadata to load ──────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleCanPlay = () => {
      setCameraReady(true);
      video.play().catch((e) => console.error('Video play error:', e));
    };

    video.addEventListener('canplay', handleCanPlay);
    return () => video.removeEventListener('canplay', handleCanPlay);
  }, [showCamera]);

  // ── Start camera ───────────────────────────────────────────────────────────
  const startCamera = useCallback(async () => {
    setCameraError(null);
    setCapturedPhoto(null);
    setCameraReady(false);

    try {
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const constraints = {
        video: {
          width:       { ideal: 640 },
          height:      { ideal: 480 },
          facingMode:  'user',
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Small delay to ensure video element is rendered
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);

      setShowCamera(true);
    } catch (err) {
      console.error('Camera error:', err);
      if (err.name === 'NotAllowedError') {
        setCameraError('Camera permission denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setCameraError('No camera found on this device.');
      } else {
        setCameraError(`Camera error: ${err.message}`);
      }
    }
  }, []);

  // ── Stop camera ────────────────────────────────────────────────────────────
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setShowCamera(false);
    setCapturedPhoto(null);
    setPendingAction(null);
    setCameraError(null);
    setCameraReady(false);
  }, []);

  // ── Capture photo ──────────────────────────────────────────────────────────
  const capturePhoto = useCallback(() => {
    const video  = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const w = video.videoWidth  || 640;
    const h = video.videoHeight || 480;

    canvas.width  = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    // Mirror the image (selfie style)
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, w, h);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
    setCapturedPhoto(dataUrl);
  }, []);

  // ── Confirm punch with photo ───────────────────────────────────────────────
  const confirmPunchWithPhoto = useCallback(async () => {
    if (!capturedPhoto || !pendingAction) return;
    setCapturing(true);
    await onPunch(pendingAction, capturedPhoto);
    setCapturing(false);
    stopCamera();
  }, [capturedPhoto, pendingAction, onPunch, stopCamera]);

  // ── Handle action button click ─────────────────────────────────────────────
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

      {/* ── Top row: Entry Mode + Time display side by side ── */}
      <div className="punch-top-row">

        {/* Left: Entry Mode Toggle */}
        <div className="entry-section">
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
                <line x1="17" y1="3" x2="7" y2="13" />
                <rect x="1" y="13" width="6" height="6" rx="1" />
                <path d="M14 3l7 7" />
              </svg>
              Manual
            </button>
          </div>
        </div>

        {/* Right: Time display or manual inputs */}
        <div className="time-section">
          {entryType === 'auto' ? (
            <div className="auto-time-display">
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
          ) : (
            <div className="manual-inputs">
              <div className="input-group">
                <label className="input-label">Time</label>
                <input
                  type="time"
                  className="time-input"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                />
              </div>
              <div className="input-group">
                <label className="input-label">Date</label>
                <input
                  type="date"
                  className="time-input"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── No member prompt ── */}
      {!selectedMember && (
        <div className="select-prompt">Please select a team member first</div>
      )}

      {/* ── Action buttons ── */}
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

      {/* ── Camera error ── */}
      {cameraError && (
        <div className="camera-error animate-fade">⚠️ {cameraError}</div>
      )}

      {/* ── Camera modal: horizontal layout ── */}
      {showCamera && (
        <div className="camera-modal animate-in">
          <div className="camera-header">
            <span className="camera-title">📷 Take your photo to punch in</span>
            <button className="camera-close" onClick={stopCamera}>✕</button>
          </div>

          <div className="camera-horizontal">
            {/* Left: video or captured photo */}
            <div className="camera-left">
              {!capturedPhoto ? (
                <>
                  <div className="video-wrap">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`camera-video ${cameraReady ? 'ready' : 'loading'}`}
                      style={{ transform: 'scaleX(-1)' }}
                    />
                    {!cameraReady && (
                      <div className="camera-loading-overlay">
                        <div className="camera-spinner" />
                        <span>Starting camera...</span>
                      </div>
                    )}
                  </div>
                  <p className="camera-hint">Position your face in the frame</p>
                </>
              ) : (
                <>
                  <img
                    src={capturedPhoto}
                    alt="Captured"
                    className="captured-img"
                  />
                  <p className="camera-hint">Photo captured successfully</p>
                </>
              )}
            </div>

            {/* Right: controls */}
            <div className="camera-right">
              {!capturedPhoto ? (
                <>
                  <div className="camera-instruction">
                    <div className="instruction-icon">👤</div>
                    <p>Make sure your face is clearly visible</p>
                    <p>Good lighting helps!</p>
                  </div>
                  <button
                    className="capture-btn"
                    onClick={capturePhoto}
                    disabled={!cameraReady}
                  >
                    <span className="capture-btn-inner" />
                  </button>
                  <span className="capture-label">Click to capture</span>
                  <button className="cam-btn cam-btn--cancel" onClick={stopCamera}>
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="camera-instruction">
                    <div className="instruction-icon">✅</div>
                    <p>Looking good!</p>
                    <p>Confirm to punch in</p>
                  </div>
                  <button
                    className="cam-btn cam-btn--confirm"
                    onClick={confirmPunchWithPhoto}
                    disabled={capturing}
                  >
                    {capturing ? 'Saving...' : 'Confirm Punch In'}
                  </button>
                  <button
                    className="cam-btn cam-btn--retake"
                    onClick={() => setCapturedPhoto(null)}
                    disabled={capturing}
                  >
                    Retake Photo
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Hidden canvas */}
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* ── Last action feedback ── */}
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