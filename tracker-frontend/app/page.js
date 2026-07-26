'use client';
import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import Image from 'next/image'; 
import AdminLogin from './AdminLogin'; 

const BACKEND_HOST = 'http://localhost:4000';

export default function EmployeeAnalyticsPortal() {
  // --------------------------------------------------------
  // 0. AUTHENTICATION STATE
  // --------------------------------------------------------
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check karein ki browser mein admin login hai ya nahi
    const role = localStorage.getItem('userRole');
    if (role === 'admin') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('userRole');
    localStorage.removeItem('userEmail');
    setIsAuthenticated(false);
  };

  // --------------------------------------------------------
  // 1. DASHBOARD DATA STATE
  // --------------------------------------------------------
  const [activeTab, setActiveTab] = useState('live'); // 'live' or 'history'
  const [employees, setEmployees] = useState([]);
  const [dailyStats, setDailyStats] = useState([]); // Holds data for the History tab
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  
  const [loading, setLoading] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState('Never');
  const [currentTime, setCurrentTime] = useState('');
  const socketRef = useRef(null);

  // --------------------------------------------------------
  // 2. DATA FETCHING & CSV EXPORT
  // --------------------------------------------------------
  
  const fetchLiveDataset = async () => {
    if (!isAuthenticated) return; // Agar login nahi hai toh data mat fetch karo
    try {
      const response = await fetch(`${BACKEND_HOST}/api/analytics-dataset`);
      if (response.ok) {
        const data = await response.json();
        setEmployees(data);
        setLastSyncedAt(new Date().toLocaleTimeString());
      }
    } catch (err) {
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDailyHistory = async () => {
    if (!isAuthenticated) return; 
    try {
      const response = await fetch(`${BACKEND_HOST}/api/daily-stats`);
      if (response.ok) {
        const data = await response.json();
        setDailyStats(data);
      }
    } catch (err) {
      console.error("Failed to load daily history:", err);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      if (activeTab === 'live') {
        fetchLiveDataset();
      } else if (activeTab === 'history') {
        fetchDailyHistory();
      }
    }
  }, [activeTab, isAuthenticated]);

  const exportToCSV = () => {
    const headers = ['Employee Email', 'Date', 'Active Time (Mins)', 'Distracted Time (Mins)', 'Idle Time (Mins)'];
    
    const dataToExport = dateFilter 
      ? dailyStats.filter(stat => stat.date === dateFilter)
      : dailyStats;

    const rows = dataToExport.map(stat => [
      stat.employeeId,
      stat.date,
      stat.activeTimeMinutes,
      stat.distractedTimeMinutes,
      stat.idleTimeMinutes
    ]);
    
    const csvContent = [
      headers.join(','),
      ...rows.map(e => e.join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Time_Export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --------------------------------------------------------
  // 3. TIMERS & WEBSOCKET SYNC
  // --------------------------------------------------------
  useEffect(() => {
    setCurrentTime(new Date().toLocaleTimeString());
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
    }, 1000);
    return () => clearInterval(clockInterval);
  }, []);

  useEffect(() => {
    if (activeTab !== 'live' || !isAuthenticated) return;
    const backgroundDataInterval = setInterval(() => {
      fetchLiveDataset();
    }, 5000);
    return () => clearInterval(backgroundDataInterval);
  }, [activeTab, isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    if (!socketRef.current) socketRef.current = io(BACKEND_HOST);
    const socket = socketRef.current;

    socket.on('manager-update', (update) => {
      setEmployees((prevEmployees) => {
        const userExists = prevEmployees.some(emp => emp.employeeId === update.employeeId);
        if (userExists) {
          return prevEmployees.map((emp) => {
            if (emp.employeeId === update.employeeId) {
              return { ...emp, ipAddress: update.ip, lastSeen: update.timestamp };
            }
            return emp;
          });
        } else {
          return [
            ...prevEmployees,
            {
              employeeId: update.employeeId,
              ipAddress: update.ip,
              activeTimeMinutes: 0, distractedTimeMinutes: 0, idleTimeMinutes: 0,
              lastSeen: update.timestamp
            }
          ];
        }
      });
    });

    socket.on('employee-purged', (data) => {
      setEmployees((prev) => prev.filter(emp => emp.employeeId !== data.employeeId));
    });

    return () => {
      socket.off('manager-update');
      socket.off('employee-purged');
    };
  }, [isAuthenticated]);


  // --------------------------------------------------------
  // UI RENDERING
  // --------------------------------------------------------
  
  if (!isAuthenticated) {
    return <AdminLogin setAuthStatus={setIsAuthenticated} />;
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-slate-950 text-white">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-500 border-t-transparent mx-auto mb-4"></div>
          <p className="text-sm font-semibold tracking-wider text-slate-400 animate-pulse">Loading Analytics...</p>
        </div>
      </div>
    );
  }

  const filteredLiveEmployees = employees.filter(emp => 
    emp.employeeId.toLowerCase().includes(searchQuery.toLowerCase()) || 
    (emp.ipAddress && emp.ipAddress.includes(searchQuery))
  );

  const filteredHistory = dailyStats.filter(stat => 
    (!searchQuery || stat.employeeId.toLowerCase().includes(searchQuery.toLowerCase())) &&
    (!dateFilter || stat.date === dateFilter)
  );

  return (
    <main className="flex min-h-screen flex-col bg-slate-950 text-slate-100 font-sans p-6">
      
      {/* Top Navigation Bar */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between pb-4 border-b border-slate-800 mb-6 gap-4">
        
        {/* 👈 LOGO AND TITLE SECTION 👉 */}
        <div className="flex items-center gap-4">
          <div className="bg-white p-1.5 rounded-lg flex items-center justify-center shadow-sm">
            <Image 
              src="/logo.png" /* 👈 YAHAN PATH FIX KIYA HAI */
              alt="Ethara.AI Logo" 
              width={100} 
              height={35} 
              className="object-contain"
              priority
            />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-100">Analytics Dashboard</h1>
            <p className="text-xs text-slate-400 mt-1">Operations Audit Control & Ingest Inversion Node</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="px-3.5 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-[10px] text-slate-400 font-mono">
            {currentTime}
          </div>
          <button 
            onClick={handleLogout}
            className="px-4 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg shadow-lg transition-all"
          >
            Logout
          </button>
        </div>
      </div>

      {/* Tab Controls */}
      <div className="flex gap-4 mb-6">
        <button 
          onClick={() => setActiveTab('live')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'live' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800'}`}
        >
          Live Tracker (All-Time)
        </button>
        <button 
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'history' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50' : 'bg-slate-900 text-slate-400 border border-slate-800 hover:bg-slate-800'}`}
        >
          Daily History & Export
        </button>
      </div>

      {/* SEARCH / FILTERS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="flex gap-3 w-full sm:w-auto">
          <input 
            type="text"
            className="w-full sm:w-64 text-xs rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-slate-200 focus:border-cyan-500 focus:outline-none"
            placeholder="Search by Email or IP..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          
          {activeTab === 'history' && (
            <input 
              type="date"
              className="w-full sm:w-48 text-xs rounded-lg border border-slate-800 bg-slate-900 px-4 py-2 text-slate-200 focus:border-cyan-500 focus:outline-none"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          )}
        </div>

        {activeTab === 'history' && (
          <button 
            onClick={exportToCSV}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg shadow-lg flex items-center gap-2 transition-all"
          >
            ↓ Export to CSV
          </button>
        )}
      </div>

      {/* TABLE 1: LIVE ALL-TIME DATA */}
      {activeTab === 'live' && (
        <div className="w-full overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-900/10 backdrop-blur-sm shadow-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-bold">
                <th className="px-6 py-3.5">Employee Email</th>
                <th className="px-6 py-3.5">Current IP</th>
                <th className="px-6 py-3.5 text-center">Total Active</th>
                <th className="px-6 py-3.5 text-center">Total Distracted</th>
                <th className="px-6 py-3.5 text-center">Total Idle</th>
                <th className="px-6 py-3.5 text-right">Last Action Time</th>
                <th className="px-6 py-3.5 text-center text-rose-400">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-xs">
              {filteredLiveEmployees.length === 0 ? (
                <tr><td colSpan="7" className="p-8 text-center text-slate-500 font-medium">No live records found.</td></tr>
              ) : filteredLiveEmployees.map((emp) => (
                <tr key={emp.employeeId} className="hover:bg-slate-900/40 transition-colors duration-75">
                  <td className="px-6 py-3.5 font-semibold text-slate-300">{emp.employeeId}</td>
                  <td className="px-6 py-3.5 font-mono text-cyan-400">{emp.ipAddress}</td>
                  <td className="px-6 py-3.5 text-center"><span className="text-emerald-400 font-bold">{emp.activeTimeMinutes}m</span></td>
                  <td className="px-6 py-3.5 text-center"><span className="text-rose-400 font-bold">{emp.distractedTimeMinutes}m</span></td>
                  <td className="px-6 py-3.5 text-center"><span className="text-amber-400 font-bold">{emp.idleTimeMinutes}m</span></td>
                  <td className="px-6 py-3.5 text-right text-slate-400">{emp.lastSeen}</td>
                  <td className="px-6 py-3.5 text-center">
                    <button onClick={async () => {
                        if(confirm(`Erase all data for ${emp.employeeId}?`)) {
                          await fetch(`${BACKEND_HOST}/api/admin/purge-employee/${emp.employeeId}`, { method: 'DELETE' });
                          fetchLiveDataset();
                        }
                      }}
                      className="px-2 py-1 rounded bg-rose-950 border border-rose-800 text-rose-400 hover:bg-rose-900 text-[10px]">
                      Purge
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TABLE 2: DAILY HISTORY DATA */}
      {activeTab === 'history' && (
        <div className="w-full overflow-x-auto rounded-xl border border-slate-800/80 bg-slate-900/10 backdrop-blur-sm shadow-2xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900/90 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[10px] font-bold">
                <th className="px-6 py-3.5">Employee Email</th>
                <th className="px-6 py-3.5">Date Filter</th>
                <th className="px-6 py-3.5 text-center">Active Mins</th>
                <th className="px-6 py-3.5 text-center">Distracted Mins</th>
                <th className="px-6 py-3.5 text-center">Idle Mins</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-xs">
              {filteredHistory.length === 0 ? (
                <tr><td colSpan="5" className="p-8 text-center text-slate-500 font-medium">No historical records found for this date.</td></tr>
              ) : filteredHistory.map((stat, idx) => (
                <tr key={`${stat.employeeId}-${stat.date}-${idx}`} className="hover:bg-slate-900/40 transition-colors">
                  <td className="px-6 py-3.5 font-semibold text-slate-300">{stat.employeeId}</td>
                  <td className="px-6 py-3.5 font-mono text-cyan-400">{stat.date}</td>
                  <td className="px-6 py-3.5 text-center"><span className="text-emerald-400">{stat.activeTimeMinutes}m</span></td>
                  <td className="px-6 py-3.5 text-center"><span className="text-rose-400">{stat.distractedTimeMinutes}m</span></td>
                  <td className="px-6 py-3.5 text-center"><span className="text-amber-400">{stat.idleTimeMinutes}m</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}