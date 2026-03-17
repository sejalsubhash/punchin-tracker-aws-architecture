import React, { useState } from 'react';
import './RecordsTable.css';

const ACTION_META = {
  'punch-in':  { label: 'Punch In',  color: 'green', emoji: '🟢' },
  'break':     { label: 'Break',     color: 'amber', emoji: '🟡' },
  'punch-out': { label: 'Punch Out', color: 'red',   emoji: '🔴' },
};

const AVATAR_COLORS = [
  '#3b82f6','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#14b8a6',
];
function getColor(name = '') {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function getInitials(name = '') {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  if (!y || !m || !d) return dateStr;
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${months[parseInt(m) - 1]} ${y}`;
}

export default function RecordsTable({ records, loading, onRefresh, filterMember }) {
  const [filterAction, setFilterAction] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const filtered = records.filter((r) => {
    const matchAction = filterAction === 'all' || r.action === filterAction;
    const matchMember = !filterMember || r.name === filterMember;
    const matchSearch = !search || r.name?.toLowerCase().includes(search.toLowerCase());
    return matchAction && matchMember && matchSearch;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div className="records-section">
      {/* Header */}
      <div className="records-header">
        <h2 className="section-title">
          <span className="title-icon">📋</span> Attendance Records
          <span className="member-count">{filtered.length} entries</span>
        </h2>
        <button className="refresh-btn" onClick={onRefresh} disabled={loading} title="Refresh records">
          <svg
            width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5"
            style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }}
          >
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="records-filters">
        <input
          type="text"
          className="search-input"
          placeholder="Search by name..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        />
        <div className="filter-tabs">
          {['all', 'punch-in', 'break', 'punch-out'].map((a) => (
            <button
              key={a}
              className={`filter-tab ${filterAction === a ? 'active' : ''} ${a !== 'all' ? `tab--${ACTION_META[a]?.color}` : ''}`}
              onClick={() => { setFilterAction(a); setPage(1); }}
            >
              {a === 'all' ? 'All' : ACTION_META[a].label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        {loading ? (
          <div className="table-loading">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            Loading records...
          </div>
        ) : paginated.length === 0 ? (
          <div className="table-empty">
            <div className="empty-icon">📭</div>
            <div>No records found</div>
            <div className="empty-sub">
              {records.length === 0
                ? 'No punch records yet. Select a member and punch in!'
                : 'Try adjusting your filters.'}
            </div>
          </div>
        ) : (
          <table className="records-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Team Member</th>
                <th>Action</th>
                <th>Time</th>
                <th>Date</th>
                <th>Entry</th>
                <th>Photo</th>
              </tr>
            </thead>
            <tbody>
              {paginated.map((record, idx) => {
                const meta = ACTION_META[record.action] || { label: record.action, color: 'blue', emoji: '⚪' };
                const color = getColor(record.name);
                const rowNum = (page - 1) * PAGE_SIZE + idx + 1;
                return (
                  <tr key={record._id || idx} className="table-row animate-in" style={{ animationDelay: `${idx * 0.04}s` }}>
                    <td className="col-num">{rowNum}</td>
                    <td className="col-member">
                      <div className="member-cell">
                        <div className="mini-avatar" style={{ background: `${color}22`, color, border: `1.5px solid ${color}44` }}>
                          {getInitials(record.name)}
                        </div>
                        <span className="member-cell-name">{record.name}</span>
                      </div>
                    </td>
                    <td className="col-action">
                      <span className={`action-tag action-tag--${meta.color}`}>
                        {meta.emoji} {meta.label}
                      </span>
                    </td>
                    <td className="col-time">
                      <span className="time-mono">{record.time || '—'}</span>
                    </td>
                    <td className="col-date">{formatDisplayDate(record.date)}</td>
                    <td className="col-entry">
                      <span className={`entry-badge ${record.entryType === 'manual' ? 'entry-manual' : 'entry-auto'}`}>
                        {record.entryType === 'manual' ? '✏️ Manual' : '⚡ Auto'}
                      </span>
                    </td>
                    <td className="col-photo">
                      {record.photoUrl ? (
                        <a href={record.photoUrl} target="_blank" rel="noopener noreferrer">
                          <img
                            src={record.photoUrl}
                            alt={`${record.name} punch-in`}
                            className="punch-photo-thumb"
                            title="Click to view full photo"
                          />
                        </a>
                      ) : (
                        <span className="no-photo">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="page-btn"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            ← Prev
          </button>
          <span className="page-info">
            Page {page} of {totalPages}
          </span>
          <button
            className="page-btn"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}