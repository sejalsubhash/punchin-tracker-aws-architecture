import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import './App.css';

import { AuthProvider, useAuth } from './context/AuthContext';
import ProtectedRoute   from './components/ProtectedRoute';
import LoginPage        from './pages/LoginPage';
import RegisterPage     from './pages/RegisterPage';
import AdminDashboard   from './pages/AdminDashboard';

import Header         from './components/Header';
import MemberSelector from './components/MemberSelector';
import PunchPanel     from './components/PunchPanel';
import RecordsTable   from './components/RecordsTable';
import StatsBar       from './components/StatsBar';
import Toast          from './components/Toast';

import { useTime }                                   from './hooks/useTime';
import { fetchAllRecords, createPunchRecord, deleteRecord } from './utils/api';

let toastCounter = 0;

const ACTION_META = {
  'punch-in':  { label: 'Punched In',  color: 'green' },
  'break':     { label: 'On Break',    color: 'amber' },
  'punch-out': { label: 'Punched Out', color: 'red'   },
};

function Dashboard() {
  const { user, logout } = useAuth();
  const [records, setRecords]               = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [punchLoading, setPunchLoading]     = useState(false);
  const [lastAction, setLastAction]         = useState(null);
  const [toasts, setToasts]                 = useState([]);
  const [memberPhoto, setMemberPhoto]       = useState(null);
  const pollingRef                          = useRef(null);
  const selectedMember = user?.name;

  const { liveTime, entryType, setEntryType, manualTime, setManualTime, manualDate, setManualDate, getSubmitTime } = useTime();

  const addToast = useCallback((type, title, message, duration = 4000) => {
    const id = ++toastCounter;
    setToasts(prev => [...prev, { id, type, title, message, duration }]);
  }, []);

  const removeToast = useCallback((id) => setToasts(prev => prev.filter(t => t.id !== id)), []);

  const loadRecords = useCallback(() => {
    setRecordsLoading(true);
    fetchAllRecords()
      .then(setRecords)
      .catch(() => addToast('error', 'Error', 'Could not load records'))
      .finally(() => setRecordsLoading(false));
  }, [addToast]);

  useEffect(() => { loadRecords(); }, [loadRecords]);
  useEffect(() => {
    pollingRef.current = setInterval(loadRecords, 30000);
    return () => clearInterval(pollingRef.current);
  }, [loadRecords]);

  useEffect(() => {
    if (!selectedMember) return;
    const latest = records.find(r => r.name === selectedMember && r.action === 'punch-in' && r.photoUrl);
    setMemberPhoto(latest?.photoUrl || null);
  }, [selectedMember, records]);

  const handlePunch = useCallback(async (action, photo = null) => {
    if (!selectedMember || punchLoading) return;
    const timeData = getSubmitTime();
    if (!timeData) { addToast('warning', 'Missing Time', 'Please enter time and date.'); return; }
    setPunchLoading(true);
    try {
      if (action === 'punch-in' && photo) {
        try {
          addToast('info', 'Verifying...', 'Checking face identity...');
          const vRes  = await fetch('/api/verify-face', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: selectedMember, photo }),
          });
          const vData = await vRes.json();
          if (vRes.status === 404) {
            addToast('warning', 'Face Not Registered', 'Please register your face from the profile.');
          } else if (!vData.verified) {
            addToast('error', 'Face Verification Failed', 'Face mismatch. Punch-in blocked.');
            setPunchLoading(false); return;
          } else {
            addToast('success', 'Identity Verified ✓', `${vData.similarity}% match`);
          }
        } catch (e) { console.warn('Face verify skipped:', e.message); }

        const resp = await fetch('/api/upload-photo', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: selectedMember, time: timeData.time, date: timeData.date, entryType: timeData.entryType, photo }),
        });
        if (!resp.ok) throw new Error('Photo upload failed');
        const data = await resp.json();
        setMemberPhoto(data.photoUrl);
        setLastAction({ action, name: selectedMember, time: timeData.time, photoUrl: data.photoUrl, ...ACTION_META[action] });
        addToast('success', 'Punched In!', `${selectedMember} punched in`);
        loadRecords(); return;
      }
      await createPunchRecord({ name: selectedMember, action, time: timeData.time, date: timeData.date, entryType: timeData.entryType });
      const meta = ACTION_META[action];
      setLastAction({ action, name: selectedMember, time: timeData.time, photoUrl: null, ...meta });
      addToast('success', `${meta.label}!`, `${selectedMember} at ${timeData.time}`);
      loadRecords();
    } catch (err) {
      addToast('error', 'Failed', err?.message || 'Could not save record.');
    } finally { setPunchLoading(false); }
  }, [selectedMember, punchLoading, getSubmitTime, addToast, loadRecords]);

  const handleDelete = useCallback(async (recordId) => {
    try {
      await deleteRecord(recordId);
      addToast('success', 'Deleted', 'Record deleted.');
      loadRecords();
    } catch { addToast('error', 'Delete Failed', 'Could not delete record.'); }
  }, [addToast, loadRecords]);

  useEffect(() => {
    if (lastAction) { const t = setTimeout(() => setLastAction(null), 8000); return () => clearTimeout(t); }
  }, [lastAction]);

  return (
    <div className="app">
      <Header selectedMember={selectedMember} liveTime={liveTime} memberPhoto={memberPhoto} onLogout={logout} />
      <main className="app-main">
        <div className="content-wrap">
          <StatsBar records={records} />
          <div className="top-section">
            <MemberSelector members={[selectedMember]} selected={selectedMember} onSelect={() => {}} loading={false} singleUser />
            <PunchPanel selectedMember={selectedMember} entryType={entryType} setEntryType={setEntryType}
              manualTime={manualTime} setManualTime={setManualTime} manualDate={manualDate} setManualDate={setManualDate}
              liveTime={liveTime} onPunch={handlePunch} loading={punchLoading} lastAction={lastAction} />
          </div>
          <div className="bottom-section">
            <RecordsTable records={records} loading={recordsLoading} onRefresh={loadRecords} selectedMember={selectedMember} onDelete={handleDelete} />
          </div>
        </div>
      </main>
      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login"    element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/admin"    element={<ProtectedRoute adminOnly><AdminDashboard /></ProtectedRoute>} />
          <Route path="/"         element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="*"         element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}