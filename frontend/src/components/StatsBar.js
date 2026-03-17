import React from 'react';
import './StatsBar.css';

export default function StatsBar({ records }) {
  const today = new Date().toISOString().slice(0, 10);

  const todayRecords = records.filter((r) => r.date === today);
  const punchIns  = todayRecords.filter((r) => r.action === 'punch-in').length;
  const breaks    = todayRecords.filter((r) => r.action === 'break').length;
  const punchOuts = todayRecords.filter((r) => r.action === 'punch-out').length;
  const uniqueMembers = [...new Set(todayRecords.map((r) => r.name))].length;

  const stats = [
    { label: "Today's Check-ins",  value: punchIns,      color: 'green', icon: '🟢' },
    { label: 'On Break',           value: breaks,        color: 'amber', icon: '🟡' },
    { label: "Today's Check-outs", value: punchOuts,     color: 'red',   icon: '🔴' },
    { label: 'Active Members',     value: uniqueMembers, color: 'blue',  icon: '👥' },
  ];

  return (
    <div className="stats-bar">
      {stats.map((s) => (
        <div key={s.label} className={`stat-card stat-card--${s.color}`}>
          <div className="stat-icon">{s.icon}</div>
          <div className="stat-body">
            <div className="stat-value">{s.value}</div>
            <div className="stat-label">{s.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
