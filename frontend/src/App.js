import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

import Header         from './components/Header';
import MemberSelector from './components/MemberSelector';
import PunchPanel     from './components/PunchPanel';
import RecordsTable   from './components/RecordsTable';
import StatsBar       from './components/StatsBar';
import Toast          from './components/Toast';

import { useTime }                                        from './hooks/useTime';
import { fetchMembers, fetchAllRecords, createPunchRecord } from './utils/api';

// ── ALB endpoint for photo upload (Private EC2 via ALB) ──────────────────────
const PHOTO_API_URL = process.env.REACT_APP_PHOTO_API_URL || '';

let toastCounter = 0;

const ACTION_META = {
  'punch-in':  { label: 'Punched In',  color: 'green' },
  'break':     { label: 'On Break',    color: 'amber' },
  'punch-out': { label: 'Punched Out', color: 'red'   },
};

export default function App() {
  const [members, setMembers]               = useState([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState(null);

  const [records, setRecords]               = useState([]);
  const [recordsLoading, setRecordsLoading] = useState(true);

  const [punchLoading, setPunchLoading]     = useState(false);
  const [lastAction, setLastAction]         = useState(null);
  const [toasts, setToasts]                 = useState([]);
  const pollingRef                          = useRef(null);

  const {
    liveTime, entryType, setEntryType,
    manualTime, setManualTime,
    manualDate, setManualDate,
    getSubmitTime,
  } = useTime();

  // ── Toast helpers ──────────────────────────────────────────────────────────
  const addToast = useCallback((type, title, message, duration = 4000) => {
    const id = ++toastCounter;
    setToasts((prev) => [...prev, { id, type, title, message, duration }]);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // ── Load members ───────────────────────────────────────────────────────────
  useEffect(() => {
    fetchMembers()
      .then(setMembers)
      .catch(() => addToast('error', 'Error', 'Could not load team members'))
      .finally(() => setMembersLoading(false));
  }, [addToast]);

  // ── Load records ───────────────────────────────────────────────────────────
  const loadRecords = useCallback(() => {
    setRecordsLoading(true);
    fetchAllRecords()
      .then(setRecords)
      .catch(() => addToast('error', 'Error', 'Could not load records'))
      .finally(() => setRecordsLoading(false));
  }, [addToast]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  // ── Auto-refresh every 30s ─────────────────────────────────────────────────
  useEffect(() => {
    pollingRef.current = setInterval(loadRecords, 30000);
    return () => clearInterval(pollingRef.current);
  }, [loadRecords]);

  // ── Punch action ───────────────────────────────────────────────────────────
  // photo is base64 string or null (for break / punch-out)
  const handlePunch = useCallback(async (action, photo = null) => {
    if (!selectedMember || punchLoading) return;

    const timeData = getSubmitTime();
    if (!timeData) {
      addToast('warning', 'Missing Time', 'Please enter both time and date for manual entry.');
      return;
    }

    setPunchLoading(true);
    try {
      let photoUrl = null;

      // ── If punch-in with photo → send to Private EC2 via ALB ──────────────
      if (action === 'punch-in' && photo && PHOTO_API_URL) {
        const response = await fetch(`${PHOTO_API_URL}/upload-photo`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name:      selectedMember,
            time:      timeData.time,
            date:      timeData.date,
            entryType: timeData.entryType,
            photo,
          }),
        });

        if (!response.ok) throw new Error('Photo upload failed');
        const data = await response.json();
        photoUrl = data.photoUrl;

        addToast('success', 'Punched In!', `${selectedMember} punched in at ${timeData.time} · photo saved to S3`);
        setLastAction({ action, name: selectedMember, time: timeData.time, photoUrl, ...ACTION_META[action] });
        loadRecords();
        return;
      }

      // ── For break / punch-out → use existing Render backend ───────────────
      await createPunchRecord({
        name:      selectedMember,
        action,
        time:      timeData.time,
        date:      timeData.date,
        entryType: timeData.entryType,
      });

      const meta = ACTION_META[action];
      setLastAction({ action, name: selectedMember, time: timeData.time, photoUrl: null, ...meta });
      addToast('success', `${meta.label}!`, `${selectedMember} ${meta.label.toLowerCase()} at ${timeData.time}`);
      loadRecords();

    } catch (err) {
      console.error('Punch error:', err);
      addToast('error', 'Failed', err?.message || 'Could not save punch record.');
    } finally {
      setPunchLoading(false);
    }
  }, [selectedMember, punchLoading, getSubmitTime, addToast, loadRecords]);

  // ── Clear last action after 8s ─────────────────────────────────────────────
  useEffect(() => {
    if (lastAction) {
      const timer = setTimeout(() => setLastAction(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [lastAction]);

  return (
    <div className="app">
      <Header selectedMember={selectedMember} liveTime={liveTime} />
      <main className="app-main">
        <div className="content-wrap">
          <StatsBar records={records} />
          <div className="main-grid">
            <div className="left-col">
              <MemberSelector
                members={members}
                selected={selectedMember}
                onSelect={setSelectedMember}
                loading={membersLoading}
              />
              <PunchPanel
                selectedMember={selectedMember}
                entryType={entryType}
                setEntryType={setEntryType}
                manualTime={manualTime}
                setManualTime={setManualTime}
                manualDate={manualDate}
                setManualDate={setManualDate}
                liveTime={liveTime}
                onPunch={handlePunch}
                loading={punchLoading}
                lastAction={lastAction}
              />
            </div>
            <div className="right-col">
              <RecordsTable
                records={records}
                loading={recordsLoading}
                onRefresh={loadRecords}
                filterMember={null}
              />
            </div>
          </div>
        </div>
      </main>
      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}