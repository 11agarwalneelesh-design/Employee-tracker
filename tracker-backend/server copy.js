const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

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
            timestamp DATETIME DEFAULT (datetime('now', 'localtime')) -- 👈 Forces SQLite to save in Local Time
        )
    `);
});

// 🌐 3. API Route using SQLite & Local Time Logging
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

        // 🕒 Get precise local time string for your terminal window
        const localTimeString = new Date().toLocaleTimeString();

        console.log(`📊 [Stored in SQLite] | User: ${employeeId} | State: ${status.toUpperCase()} at ${localTimeString}`);
        
        io.emit('manager-update', { 
            employeeId, 
            status, 
            ip: formattedIp, 
            timestamp: new Date().toLocaleString() // 👈 Sends local time format to socket listeners
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
                timestamp,
                -- 🕒 Gets the timestamp of the next chronological log entry
                LEAD(timestamp) OVER (PARTITION BY employeeId ORDER BY timestamp ASC) as next_log_time
            FROM track_logs
        ),
        LogDurations AS (
            SELECT 
                employeeId,
                status,
                timestamp, -- Pass original timestamp through to find the last seen time
                -- ⏱️ Calculate difference in seconds. Default to 3s fallback if it's the current active window
                COALESCE(
                    (strftime('%s', next_log_time) - strftime('%s', timestamp)), 
                    3
                ) as duration_seconds
            FROM OrderedLogs
        )
        SELECT 
            employeeId,
            -- 👥 Sum up the total seconds and convert cleanly to fractional minutes
            ROUND(SUM(CASE WHEN status = 'Active on Target URL' THEN duration_seconds ELSE 0 END) / 60.0, 2) AS activeTimeMinutes,
            ROUND(SUM(CASE WHEN status LIKE 'Distracted%' THEN duration_seconds ELSE 0 END) / 60.0, 2) AS distractedTimeMinutes,
            ROUND(SUM(CASE WHEN status = 'Idle (System Inactive)' THEN duration_seconds ELSE 0 END) / 60.0, 2) AS idleTimeMinutes,
            MAX(timestamp) AS lastSeen
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