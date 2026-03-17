import React from 'react';
import './Header.css';

export default function Header({ selectedMember, liveTime }) {
  return (
    <header className="app-header">
      <div className="header-inner">
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

        <div className="header-center">
          {selectedMember ? (
            <div className="welcome-badge animate-in">
              <div className="welcome-dot" />
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

        <div className="header-clock">
          <div className="clock-time">{liveTime.time}</div>
          <div className="clock-date">{liveTime.display}</div>
        </div>
      </div>
    </header>
  );
}
