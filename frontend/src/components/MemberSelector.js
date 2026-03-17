import React from 'react';
import './MemberSelector.css';

const AVATAR_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6',
];

function getInitials(name) {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function MemberSelector({ members, selected, onSelect, loading }) {
  if (loading) {
    return (
      <div className="member-section">
        <h2 className="section-title">
          <span className="title-icon">👥</span> Team Members
        </h2>
        <div className="member-grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="member-card skeleton" />
          ))}
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
      <div className="member-grid">
        {members.map((name) => {
          const color = getColor(name);
          const isSelected = selected === name;
          return (
            <button
              key={name}
              className={`member-card ${isSelected ? 'selected' : ''}`}
              onClick={() => onSelect(isSelected ? null : name)}
              style={isSelected ? { '--card-accent': color, borderColor: color } : { '--card-accent': color }}
            >
              <div
                className="member-avatar"
                style={{ background: `${color}22`, color, border: `1.5px solid ${color}44` }}
              >
                {getInitials(name)}
              </div>
              <div className="member-name">{name}</div>
              {isSelected && <div className="selected-check">✓</div>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
