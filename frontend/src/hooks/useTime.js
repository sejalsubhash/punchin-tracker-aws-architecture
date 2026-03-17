import { useState, useEffect, useCallback } from 'react';

const pad = (n) => String(n).padStart(2, '0');

export const getNow = () => {
  const now = new Date();
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const display = now.toLocaleDateString('en-IN', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  return { time, date, display };
};

export function useTime() {
  const [liveTime, setLiveTime] = useState(getNow);
  const [entryType, setEntryType] = useState('auto'); // 'auto' | 'manual'
  const [manualTime, setManualTime] = useState('');
  const [manualDate, setManualDate] = useState('');

  // Live clock tick
  useEffect(() => {
    const id = setInterval(() => setLiveTime(getNow()), 1000);
    return () => clearInterval(id);
  }, []);

  const getSubmitTime = useCallback(() => {
    if (entryType === 'manual') {
      if (!manualTime || !manualDate) return null;
      return { time: manualTime, date: manualDate, entryType: 'manual' };
    }
    const now = getNow();
    return { time: now.time, date: now.date, entryType: 'auto' };
  }, [entryType, manualTime, manualDate]);

  return {
    liveTime,
    entryType,
    setEntryType,
    manualTime,
    setManualTime,
    manualDate,
    setManualDate,
    getSubmitTime,
  };
}
