'use client';
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';

// 🎯 Ensure this matches your host machine's Wi-Fi IPv4 address
const BACKEND_HOST = 'http://localhost:4000';

export default function ManagerDashboard() {
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState('Never');
  const [currentTime, setCurrentTime] = useState('');
  
  // Use a ref to capture WebSocket instances safely across render cycles
  const socketRef = useRef(null);

  // 1. Core Analytics Fetcher (Called on load and every 5 seconds automatically)
  const fetchAnalyticsDataset = async () => {
    try {
      const response = await fetch(`${BACKEND_HOST}/api/analytics-dataset`);
      if (response.ok) {
        const data = await response.json();
        setEmployees(data);
        setLastSyncedAt(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error("❌ Failed loading historical analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  // 2. Setup the Live Current Time Clock Engine
  useEffect(() => {
    setCurrentTime(new Date().toLocaleTimeString());
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  // 3. Setup the 5-Second Automated Background Dataset Pulling Loop
  useEffect(() => {
    fetchAnalyticsDataset(); // Run instantly on initial layout build
    
    const backgroundDataInterval = setInterval(() => {
      fetchAnalyticsDataset();
    }, 5000);

    return () => clearInterval(backgroundDataInterval);
  }, []);

  // 4. Setup Real-time WebSockets to merge focus updates instantly between interval loops
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(BACKEND_HOST);
    }

    const socket = socketRef.current;

    socket.on('manager-update', (update) => {
      setEmployees((prevEmployees) => {
        const userExists = prevEmployees.some(emp => emp.employeeId === update.employeeId);

        if (userExists) {
          return prevEmployees.map((emp) => {
            if (emp.employeeId === update.employeeId) {
              return {
                ...emp,
                ipAddress: update.ip, 
                lastSeen: update.timestamp // Dynamic update via live WebSocket push
              };
            }
            return emp;
          });
        } else {
          return [
            ...prevEmployees,
            {
              employeeId: update.employeeId,
              ipAddress: update.ip,
              activeTimeMinutes: 0.0,
              distractedTimeMinutes: 0.0,
              idleTimeMinutes: 0.0,
              lastSeen: update.timestamp
            }
          ];
        }
      });
    });

    return () => {
      socket.off('manager-update');
    };
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-900 text-white">
        <p className="text-lg font-semibold animate-pulse tracking-wide">Compiling Live Analytics Dataset...</p>
      </div>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-slate-900 text-slate-100 font-sans p-6 overflow-y-auto">
      
      {/* Dashboard Top Header */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between pb-6 border-b border-slate-800 mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-emerald-400 bg-clip-text text-transparent">
            Operations Audit Control Board
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Real-time workforce efficiency metrics synced via background pooling and WebSockets.
          </p>
        </div>

        {/* 🕒 Live Meta Timing & Network Metrics Bar */}
        <div className="flex flex-wrap items-center gap-4 w-full lg:w-auto">
          {/* 🌐 Network Server IP Module */}
          <div className="flex flex-col px-4 py-2 bg-slate-950/40 border border-slate-800 rounded-lg min-w-[140px]">
            <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Host Network IP</span>
            <span className="text-sm font-mono text-emerald-400 font-bold mt-0.5">10.107.140.130</span>
          </div>

          <div className="flex flex-col px-4 py-2 bg-slate-950/40 border border-slate-800 rounded-lg min-w-[140px]">
            <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Current Time</span>
            <span className="text-sm font-mono text-slate-300 font-bold mt-0.5">{currentTime}</span>
          </div>

          <div className="flex flex-col px-4 py-2 bg-slate-950/40 border border-slate-800 rounded-lg min-w-[140px]">
            <span className="text-[10px] text-slate-500 uppercase font-semibold tracking-wider">Last Data Sync</span>
            <span className="text-sm font-mono text-cyan-400 font-bold mt-0.5">{lastSyncedAt}</span>
          </div>

          <div className="px-4 py-3 bg-emerald-950/30 border border-emerald-800/50 rounded-lg text-xs font-mono text-emerald-400 shadow-inner h-full flex items-center">
            <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block mr-2 animate-pulse"></span>
            Sync Interval: 5s Auto
          </div>
        </div>
      </div>

      {/* Multi-User Real-time Table */}
      {employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-12 border border-dashed border-slate-800 rounded-2xl bg-slate-950/40">
          <p className="text-slate-500 font-medium">No live telemetry detected yet.</p>
          <p className="text-xs text-slate-600 mt-1 font-mono">Ensure employee Chrome Extensions are running.</p>
        </div>
      ) : (
        <div className="w-full overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/20 backdrop-blur-sm shadow-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-800/60 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-xs font-semibold">
                <th className="px-6 py-4">Employee Identifier</th>
                <th className="px-6 py-4">User Client IP</th>
                <th className="px-6 py-4 text-center">Active Time</th>
                <th className="px-6 py-4 text-center">Distracted Time</th>
                <th className="px-6 py-4 text-center">Idle Time</th>
                <th className="px-6 py-4 text-right">Target URL Last Departed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50 text-sm">
              {employees.map((emp) => (
                <tr key={emp.employeeId} className="hover:bg-slate-800/30 transition-colors duration-150">
                  
                  {/* Identity Profile Info */}
                  <td className="px-6 py-4 font-medium text-slate-200 font-mono">
                    {emp.employeeId}
                  </td>

                  {/* Remote IP Address Column */}
                  <td className="px-6 py-4 font-mono text-xs font-semibold text-cyan-400">
                    {emp.ipAddress || '127.0.0.1'}
                  </td>
                  
                  {/* Active Time Segment Pill */}
                  <td className="px-6 py-4 text-center">
                    <span className="inline-block px-3 py-1 bg-emerald-950/40 border border-emerald-800/60 text-emerald-400 font-bold rounded-md font-mono min-w-[80px]">
                      {emp.activeTimeMinutes}m
                    </span>
                  </td>
                  
                  {/* Distracted Time Segment Pill */}
                  <td className="px-6 py-4 text-center">
                    <span className="inline-block px-3 py-1 bg-rose-950/40 border border-rose-800/60 text-rose-400 font-bold rounded-md font-mono min-w-[80px]">
                      {emp.distractedTimeMinutes}m
                    </span>
                  </td>
                  
                  {/* Idle Time Segment Pill */}
                  <td className="px-6 py-4 text-center">
                    <span className="inline-block px-3 py-1 bg-amber-950/40 border border-amber-800/60 text-amber-400 font-bold rounded-md font-mono min-w-[80px]">
                      {emp.idleTimeMinutes}m
                    </span>
                  </td>
                  
                  {/* Dynamic Fallback handling for new users */}
                  <td className={`px-6 py-4 text-right font-mono text-xs ${emp.lastSeen === 'Not Active Yet' ? 'text-amber-500 font-semibold' : 'text-slate-400'}`}>
                    {emp.lastSeen}
                  </td>

                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

    </main>
  );
}