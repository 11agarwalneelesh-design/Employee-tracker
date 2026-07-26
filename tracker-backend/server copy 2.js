const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// File System Configuration for Local File Logs
const LOG_FILE_PATH = path.join(__dirname, 'activity_logs.txt');

// Helper function to append tracking payloads to local text file
function logToFile(employeeId, status, ipAddress) {
    const timeStampStr = new Date().toLocaleString();
    const logEntry = `[${timeStampStr}] | IP: ${ipAddress} | User: ${employeeId} | Status: ${status}\n`;
    
    fs.appendFile(LOG_FILE_PATH, logEntry, (err) => {
        if (err) console.error("❌ Failed to write to activity_logs.txt:", err.message);
    });
}

// 🔌 1. Connect to SQLite database
const db = new sqlite3.Database('./tracker.db', (err) => {
    if (err) {
        console.error('❌ SQLite Connection Error:', err.message);
    } else {
        console.log('💾 Connected to SQLite Database Successfully (tracker.db)');
    }
});

// 📝 2. Create the Logs Table with LOCALTIME configuration
db.serialize(() => {
    db.run(`
        CREATE TABLE IF NOT EXISTS track_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employeeId TEXT NOT NULL,
            status TEXT NOT NULL,
            ipAddress TEXT NOT NULL,
            timestamp DATETIME DEFAULT (datetime('now', 'localtime'))
        )
    `);
});

// 🌐 3. API Route using SQLite & Local File Logging
app.post('/api/track-status', (req, res) => {
    if (!req.body || Object.keys(req.body).length === 0) {
        return res.sendStatus(400);
    }

    const { employeeId, status } = req.body;
    
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const formattedIp = clientIp.includes('::1') ? '127.0.0.1' : clientIp.replace(/^.*:/, '');

    const query = `INSERT INTO track_logs (employeeId, status, ipAddress) VALUES (?, ?, ?)`;
    
    db.run(query, [employeeId, status, formattedIp], function(err) {
        if (err) {
            console.error("❌ Failed to save tracking log to DB:", err.message);
            return res.sendStatus(500);
        }

        const localTimeString = new Date().toLocaleTimeString();
        console.log(`📊 [Stored in SQLite] | User: ${employeeId} | State: ${status.toUpperCase()} at ${localTimeString}`);
        
        // 🎯 Synchronous Local File Logging Trigger
        logToFile(employeeId, status, formattedIp);

        io.emit('manager-update', { 
            employeeId, 
            status, 
            ip: formattedIp, 
            timestamp: new Date().toLocaleTimeString()
        });

        res.sendStatus(200);
    });
});

// 📂 4. Endpoint to fetch historical datasets for your analytics charts
app.get('/api/analytics-dataset', (req, res) => {
    const query = `
        WITH OrderedLogs AS (
            SELECT 
                employeeId,
                status,
                ipAddress,
                timestamp,
                LEAD(timestamp) OVER (PARTITION BY employeeId ORDER BY timestamp ASC) as next_log_time,
                LEAD(status) OVER (PARTITION BY employeeId ORDER BY timestamp ASC) as next_status
            FROM track_logs
        ),
        LogDurations AS (
            SELECT 
                employeeId,
                status,
                ipAddress,
                timestamp,
                CASE 
                    WHEN status = 'Active on Target URL' AND next_status LIKE 'Distracted%' THEN next_log_time
                    WHEN status = 'Active on Target URL' AND next_status LIKE 'Idle%' THEN next_log_time
                    ELSE NULL 
                END as left_target_time,
                CASE 
                    WHEN next_log_time IS NULL THEN 
                        MAX(0, strftime('%s', datetime('now', 'localtime')) - strftime('%s', timestamp))
                    ELSE 
                        MAX(0, strftime('%s', next_log_time) - strftime('%s', timestamp))
                END as duration_seconds
            FROM OrderedLogs
        )
        SELECT 
            employeeId,
            (SELECT ipAddress FROM track_logs WHERE employeeId = LogDurations.employeeId ORDER BY id DESC LIMIT 1) as ipAddress,
            COALESCE(ROUND(SUM(CASE WHEN status = 'Active on Target URL' THEN duration_seconds ELSE 0 END) / 60.0, 2), 0.0) AS activeTimeMinutes,
            COALESCE(ROUND(SUM(CASE WHEN status LIKE 'Distracted%' THEN duration_seconds ELSE 0 END) / 60.0, 2), 0.0) AS distractedTimeMinutes,
            COALESCE(ROUND(SUM(CASE WHEN status = 'Idle (System Inactive)' THEN duration_seconds ELSE 0 END) / 60.0, 2), 0.0) AS idleTimeMinutes,
            COALESCE(MAX(left_target_time), 'Not Active Yet') AS lastSeen
        FROM LogDurations
        GROUP BY employeeId;
    `;

    db.all(query, [], (err, rows) => {
        if (err) {
            console.error("❌ Failed to compile precise dataset:", err.message);
            return res.status(500).json({ error: "Dataset compilation failed" });
        }
        res.json(rows);
    });
});

server.listen(4000, () => {
    console.log('🚀 Backend Server running on http://localhost:4000');
});