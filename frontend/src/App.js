import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

import Header         from './components/Header';
import MemberSelector from './components/MemberSelector';
import PunchPanel     from './components/PunchPanel';
import RecordsTable   from './components/RecordsTable';
import StatsBar       from './components/StatsBar';
import Toast          from './components/Toast';

import { useTime }                                           from './hooks/useTime';
import { fetchMembers, fetchAllRecords, createPunchRecord, deleteRecord } from './utils/api';

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
  const [memberPhoto, setMemberPhoto]       = useState(null); // latest punch-in photo
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

  // ── When member changes, find their latest punch-in photo ─────────────────
  useEffect(() => {
    if (!selectedMember) { setMemberPhoto(null); return; }
    const latestPhoto = records.find(
      (r) => r.name === selectedMember && r.action === 'punch-in' && r.photoUrl
    );
    setMemberPhoto(latestPhoto?.photoUrl || null);
  }, [selectedMember, records]);

  // ── Handle punch action ────────────────────────────────────────────────────
  const handlePunch = useCallback(async (action, photo = null) => {
    if (!selectedMember || punchLoading) return;

    const timeData = getSubmitTime();
    if (!timeData) {
      addToast('warning', 'Missing Time', 'Please enter both time and date for manual entry.');
      return;
    }

    setPunchLoading(true);
    try {
      // Punch-in with photo → proxy through Render backend to Private EC2
      if (action === 'punch-in' && photo) {
        const response = await fetch(`/api/upload-photo`, {
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

        // Show photo in header
        setMemberPhoto(data.photoUrl);

        setLastAction({
          action,
          name:     selectedMember,
          time:     timeData.time,
          photoUrl: data.photoUrl,
          ...ACTION_META[action],
        });
        addToast('success', 'Punched In!', `${selectedMember} punched in · photo saved to S3`);
        loadRecords();
        return;
      }

      // Break / punch-out → use Render backend directly
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

  // ── Handle delete ──────────────────────────────────────────────────────────
  const handleDelete = useCallback(async (recordId) => {
    try {
      await deleteRecord(recordId);
      addToast('success', 'Deleted', 'Record deleted from dashboard. S3 backup preserved.');
      loadRecords();
    } catch (err) {
      console.error('Delete error:', err);
      addToast('error', 'Delete Failed', 'Could not delete record.');
    }
  }, [addToast, loadRecords]);

  // ── Clear last action after 8s ─────────────────────────────────────────────
  useEffect(() => {
    if (lastAction) {
      const timer = setTimeout(() => setLastAction(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [lastAction]);

  return (
    <div className="app">
      <Header
        selectedMember={selectedMember}
        liveTime={liveTime}
        memberPhoto={memberPhoto}
      />

      <main className="app-main">
        <div className="content-wrap">

          {/* Stats bar */}
          <StatsBar records={records} />

          {/* Top: member selector + punch panel side by side */}
          <div className="top-section">
            <MemberSelector
              members={members}
              selected={selectedMember}
              onSelect={(name) => {
                setSelectedMember(name);
                setMemberPhoto(null);
              }}
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

          {/* Bottom: records table full width */}
          <div className="bottom-section">
            <RecordsTable
              records={records}
              loading={recordsLoading}
              onRefresh={loadRecords}
              selectedMember={selectedMember}
              onDelete={handleDelete}
            />
          </div>

        </div>
      </main>

      <Toast toasts={toasts} removeToast={removeToast} />
    </div>
  );
}