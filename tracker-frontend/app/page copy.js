'use client';
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:4000'); // Connects to our Express server
const EMPLOYEE_ID = "Emp_John_Doe"; // Mock employee ID

export default function Home() {
  const [status, setStatus] = useState('Active');
  const idleTimerRef = useRef(null);

  // Function to send status updates to the backend
  const updateStatus = (newStatus) => {
    setStatus(newStatus);
    socket.emit('status-change', {
      employeeId: EMPLOYEE_ID,
      status: newStatus
    });
  };

  // Resets the idle timer whenever there is user activity
  const resetIdleTimer = () => {
    // If they were idle or distracted, bring them back to Active
    if (status !== 'Active' && document.visibilityState === 'visible') {
      updateStatus('Active');
    }

    // Clear existing countdown
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    // Set a 10-second idle window for rapid testing (change to 120000 for 2 mins later)
    idleTimerRef.current = setTimeout(() => {
      updateStatus('Idle');
    }, 10000); 
  };

  useEffect(() => {
    // 1. Listen for User Activity (Mouse & Keyboard)
    window.addEventListener('mousemove', resetIdleTimer);
    window.addEventListener('keydown', resetIdleTimer);
    window.addEventListener('click', resetIdleTimer);

    // 2. Listen for Tab Switching / Minimizing (Page Visibility API)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        updateStatus('Distracted/Tab-Switched');
      } else {
        resetIdleTimer();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial start of the timer when app opens
    resetIdleTimer();

    // Cleanup listeners when component unmounts
    return () => {
      window.removeEventListener('mousemove', resetIdleTimer);
      window.removeEventListener('keydown', resetIdleTimer);
      window.removeEventListener('click', resetIdleTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, [status]);

  // Dynamic Background styling based on current state
  const getBgColor = () => {
    if (status === 'Active') return 'bg-green-100 border-green-500 text-green-700';
    if (status === 'Idle') return 'bg-yellow-100 border-yellow-500 text-yellow-700';
    return 'bg-red-100 border-red-500 text-red-700';
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-slate-50">
      <div className={`p-8 rounded-xl border-2 shadow-md max-w-md text-center transition-all duration-300 ${getBgColor()}`}>
        <h1 className="text-2xl font-bold mb-2">Employee Audit Portal</h1>
        <p className="text-sm opacity-80 mb-4">ID: {EMPLOYEE_ID}</p>
        <div className="text-xl font-mono uppercase font-black tracking-wider">
          Current State: {status}
        </div>
        <p className="text-xs mt-6 text-slate-500">
          *To test: Stop moving your mouse for 10 seconds to trigger "Idle", or click into another browser tab to trigger "Distracted".
        </p>
      </div>
    </main>
  );
}