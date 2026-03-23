import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import './AdminDashboard.css';

function formatDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminDashboard() {
  const { user, logout, authFetch } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab]   = useState('pending');
  const [users, setUsers]           = useState([]);
  const [records, setRecords]       = useState([]);
  const [stats, setStats]           = useState({});
  const [loading, setLoading]       = useState(true);
  const [actionLoading, setActionLoading] = useState(null);
  const [toast, setToast]           = useState(null);

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, recordsRes, statsRes] = await Promise.all([
        authFetch('/api/admin/users'),
        authFetch('/api/records'),
        authFetch('/api/admin/stats'),
      ]);
      const usersData   = await usersRes.json();
      const recordsData = await recordsRes.json();
      const statsData   = await statsRes.json();

      setUsers(usersData.users   || []);
      setRecords(recordsData.records || []);
      setStats(statsData);
    } catch (err) {
      showToast('Failed to load data', 'error');
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleApprove = async (userId, userName) => {
    setActionLoading(userId);
    try {
      const res  = await authFetch(`/api/admin/approve/${userId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`✅ ${userName} approved successfully`);
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleReject = async (userId, userName) => {
    if (!window.confirm(`Reject ${userName}'s registration?`)) return;
    setActionLoading(userId);
    try {
      const res  = await authFetch(`/api/admin/reject/${userId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showToast(`${userName} rejected`, 'warning');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteRecord = async (recordId) => {
    if (!window.confirm('Delete this attendance record?')) return;
    try {
      const res = await authFetch(`/api/admin/records/${recordId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      showToast('Record deleted');
      loadData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const pendingUsers  = users.filter(u => u.status === 'pending');
  const approvedUsers = users.filter(u => u.status === 'approved');
  const rejectedUsers = users.filter(u => u.status === 'rejected');

  return (
    <div className="admin-page">
      {/* Header */}
      <header className="admin-header">
        <div className="admin-header-inner">
          <div className="admin-brand">
            <div className="admin-brand-icon">🕐</div>
            <div>
              <div className="admin-brand-name">PUNCH<span>TRACKER</span></div>
              <div className="admin-brand-sub">Admin Dashboard</div>
            </div>
          </div>
          <div className="admin-user">
            <span>👤 {user?.name}</span>
            <button className="admin-logout" onClick={() => { logout(); navigate('/login'); }}>
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="admin-main">
        {/* Stats */}
        <div className="admin-stats">
          <div className="admin-stat admin-stat--amber">
            <div className="admin-stat-num">{stats.pendingUsers || 0}</div>
            <div className="admin-stat-lbl">Pending Approval</div>
          </div>
          <div className="admin-stat admin-stat--green">
            <div className="admin-stat-num">{stats.approvedUsers || 0}</div>
            <div className="admin-stat-lbl">Approved Users</div>
          </div>
          <div className="admin-stat admin-stat--red">
            <div className="admin-stat-num">{stats.rejectedUsers || 0}</div>
            <div className="admin-stat-lbl">Rejected</div>
          </div>
          <div className="admin-stat admin-stat--blue">
            <div className="admin-stat-num">{stats.todayPunches || 0}</div>
            <div className="admin-stat-lbl">Today's Punches</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="admin-tabs">
          {[
            { key: 'pending',  label: `Pending (${pendingUsers.length})` },
            { key: 'approved', label: `Approved (${approvedUsers.length})` },
            { key: 'rejected', label: `Rejected (${rejectedUsers.length})` },
            { key: 'records',  label: `Attendance (${records.length})` },
          ].map(tab => (
            <button key={tab.key}
              className={`admin-tab ${activeTab === tab.key ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.key)}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="admin-card">
          {loading ? (
            <div className="admin-loading">Loading...</div>
          ) : (
            <>
              {/* Pending Users */}
              {activeTab === 'pending' && (
                <div>
                  {pendingUsers.length === 0 ? (
                    <div className="admin-empty">No pending registrations</div>
                  ) : (
                    <table className="admin-table">
                      <thead><tr>
                        <th>Name</th><th>Email</th><th>Registered</th><th>Actions</th>
                      </tr></thead>
                      <tbody>
                        {pendingUsers.map(u => (
                          <tr key={u.id}>
                            <td><strong>{u.name}</strong></td>
                            <td>{u.email}</td>
                            <td>{formatDate(u.createdAt)}</td>
                            <td>
                              <div className="admin-actions">
                                <button className="admin-btn admin-btn--approve"
                                  disabled={actionLoading === u.id}
                                  onClick={() => handleApprove(u.id, u.name)}>
                                  {actionLoading === u.id ? '...' : '✅ Approve'}
                                </button>
                                <button className="admin-btn admin-btn--reject"
                                  disabled={actionLoading === u.id}
                                  onClick={() => handleReject(u.id, u.name)}>
                                  {actionLoading === u.id ? '...' : '❌ Reject'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {/* Approved Users */}
              {activeTab === 'approved' && (
                <table className="admin-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Approved On</th><th>Status</th></tr></thead>
                  <tbody>
                    {approvedUsers.map(u => (
                      <tr key={u.id}>
                        <td><strong>{u.name}</strong></td>
                        <td>{u.email}</td>
                        <td>{formatDate(u.approvedAt || u.createdAt)}</td>
                        <td><span className="status-badge status--approved">Approved</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Rejected Users */}
              {activeTab === 'rejected' && (
                <table className="admin-table">
                  <thead><tr><th>Name</th><th>Email</th><th>Registered</th><th>Status</th></tr></thead>
                  <tbody>
                    {rejectedUsers.map(u => (
                      <tr key={u.id}>
                        <td><strong>{u.name}</strong></td>
                        <td>{u.email}</td>
                        <td>{formatDate(u.createdAt)}</td>
                        <td><span className="status-badge status--rejected">Rejected</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {/* Attendance Records */}
              {activeTab === 'records' && (
                <table className="admin-table">
                  <thead><tr>
                    <th>Member</th><th>Action</th><th>Time</th><th>Date</th><th>Entry</th><th>Delete</th>
                  </tr></thead>
                  <tbody>
                    {records.map((r, i) => (
                      <tr key={r.id || i}>
                        <td><strong>{r.name}</strong></td>
                        <td>
                          <span className={`action-tag action-tag--${r.action === 'punch-in' ? 'green' : r.action === 'break' ? 'amber' : 'red'}`}>
                            {r.action}
                          </span>
                        </td>
                        <td style={{ fontFamily: 'monospace', color: '#2563eb' }}>{r.time}</td>
                        <td>{r.date}</td>
                        <td>{r.entryType}</td>
                        <td>
                          <button className="admin-btn admin-btn--reject" style={{ padding: '4px 10px', fontSize: '12px' }}
                            onClick={() => handleDeleteRecord(r.id || r._id)}>
                            🗑
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </main>

      {toast && (
        <div className={`admin-toast admin-toast--${toast.type}`}>{toast.msg}</div>
      )}
    </div>
  );
}