import React from 'react';
import './Header.css';

export default function Header({ selectedMember, liveTime, memberPhoto, onLogout }) {
  return (
    <header className="app-header">
      <div className="header-inner">

        {/* Brand */}
        <div className="header-brand">
          <div className="brand-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div>
            <h1 className="brand-name">PUNCH<span>TRACKER</span></h1>
            <p className="brand-sub">Team Attendance System</p>
          </div>
        </div>

        {/* Center welcome with photo */}
        <div className="header-center">
          {selectedMember ? (
            <div className="welcome-badge animate-in">
              {memberPhoto ? (
                <img
                  src={memberPhoto}
                  alt={selectedMember}
                  className="welcome-photo"
                />
              ) : (
                <div className="welcome-dot" />
              )}
              <span className="welcome-text">
                Welcome, <strong>{selectedMember}</strong>
              </span>
            </div>
          ) : (
            <div className="no-selection-hint">
              ← Select a team member to begin
            </div>
          )}
        </div>

        {/* Logout button */}
        {onLogout && (
          <button className="header-logout" onClick={onLogout} title="Logout">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
              <polyline points="16 17 21 12 16 7"/>
              <line x1="21" y1="12" x2="9" y2="12"/>
            </svg>
            Logout
          </button>
        )}

        {/* Clock */}
        <div className="header-clock">
          <div className="clock-time">{liveTime.time}</div>
          <div className="clock-date">{liveTime.display}</div>
        </div>

      </div>
    </header>
  );
}