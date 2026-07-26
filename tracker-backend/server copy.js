const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const winston = require('winston');
require('winston-daily-rotate-file');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// 🪵 1. ASYNCHRONOUS ROLLING LOGGER CONFIGURATION (File Rollback Feature)
const fileRotateTransport = new winston.transports.DailyRotateFile({
    filename: path.join(__dirname, 'logs', 'activity-%DATE%.log'),
    datePattern: 'YYYY-MM-DD', // Automatically rolls over to a new file at midnight every day
    maxFiles: '14d',           // Rollback safety: automatically deletes logs older than 14 days
    zippedArchive: true,       // Compresses rolled-back files to preserve server storage space
    format: winston.format.combine(
        winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        winston.format.printf(info => `[${info.timestamp}] | ${info.message}`)
    )
});

const logger = winston.createLogger({
    levels: winston.config.syslog.levels,
    transports: [
        fileRotateTransport,
        new winston.transports.Console({
            format: winston.format.combine(winston.format.colorize(), winston.format.simple())
        })
    ]
});

// 💾 2. MONGODB CONNECTION SETTINGS
// Connects to the local MongoDB instance installed via your setup wizard
const MONGO_URI = 'mongodb://localhost:27017/employeetracker';
mongoose.connect(MONGO_URI)
    .then(() => console.log('💾 Connected to MongoDB Successfully via Mongoose'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

// 📝 3. DATABASE SCHEMAS & MODELS
// Raw Activity Log Schema (Preserves historical transactions)
const TrackLogSchema = new mongoose.Schema({
    employeeId: { type: String, required: true, index: true },
    status: { type: String, required: true },
    ipAddress: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});
const TrackLog = mongoose.model('TrackLog', TrackLogSchema);

// Aggregate Cache Schema (Serves your analytics dashboard instantly)
const EmployeeSummarySchema = new mongoose.Schema({
    employeeId: { type: String, required: true, unique: true },
    ipAddress: { type: String, default: 'Unknown IP' },
    activeTimeMinutes: { type: Number, default: 0.0 },
    distractedTimeMinutes: { type: Number, default: 0.0 },
    idleTimeMinutes: { type: Number, default: 0.0 },
    lastSeen: { type: String, default: 'Not Active Yet' },
    lastUpdated: { type: String }
});
const EmployeeSummary = mongoose.model('EmployeeSummary', EmployeeSummarySchema);

// 🌐 4. HIGH-PERFORMANCE INGEST API ROUTE
app.post('/api/track-status', async (req, res) => {
    // ⚡ INSTANT RESPONSE: Frees browser network requests under high load
    res.sendStatus(204);

    if (!req.body || !req.body.employeeId) return;

    const { employeeId, status } = req.body;
    if (employeeId === "Unknown_Employee") return;

    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

    // 1. If x-forwarded-for contains a proxy chain list, extract the true client origin
    if (clientIp.includes(',')) {
        clientIp = clientIp.split(',')[0].trim();
    }
    
    // 2. ONLY strip the prefix if it's an IPv4 address mapped inside an IPv6 notation
    if (clientIp.startsWith('::ffff:')) {
        clientIp = clientIp.replace('::ffff:', '');
    }

    // 3. Normalize local loopback addresses cleanly
    const formattedIp = (clientIp === '::1' || clientIp === 'localhost') ? '127.0.0.1' : clientIp;

    const now = new Date();
    const localTimeString = now.toLocaleTimeString();

    try {
        // Step A: Fetch the employee's last status packet to calculate exact elapsed duration
        const lastLog = await TrackLog.findOne({ employeeId }).sort({ _id: -1 }).exec();
        
        let durationMinutes = 0.0;
        if (lastLog) {
            const elapsedMs = now - lastLog.timestamp;
            // Cap safety window to a maximum of 2 minutes for lost network streams
            durationMinutes = Math.min(elapsedMs / (1000 * 60), 2.0);
        }

        // Step B: Persist raw log entry to MongoDB
        await TrackLog.create({ employeeId, status, ipAddress: formattedIp });

        // Step C: Stream log data directly to the rolling text file buffer
        logger.info(`IP: ${formattedIp} | User: ${employeeId} | Status: ${status.toUpperCase()}`);

        // Step D: Calculate metric accumulation rules
        let incField = 'distractedTimeMinutes';
        if (lastLog) {
            if (lastLog.status === 'Active on Target URL') incField = 'activeTimeMinutes';
            if (lastLog.status === 'Idle (System Inactive)') incField = 'idleTimeMinutes';
        }

        const lastSeenTimestamp = (status === 'Active on Target URL') ? localTimeString : 'Not Active Yet';

        // Step E: Atomic update-or-insert (Upsert) calculation matrix cache
        const updatePayload = {
            ipAddress: formattedIp,
            lastUpdated: localTimeString
        };
        if (status === 'Active on Target URL') {
            updatePayload.lastSeen = localTimeString;
        }

        const summary = await EmployeeSummary.findOneAndUpdate(
            { employeeId },
            { 
                $set: updatePayload,
                $inc: { [incField]: durationMinutes } 
            },
            { returnDocument: 'after', upsert: true } 
        );

        // Step F: Broadcast processed updates downstream to the monitoring control board via WebSockets
        io.emit('manager-update', {
            employeeId: summary.employeeId,
            status: status,
            ip: summary.ipAddress,
            activeTimeMinutes: Number(summary.activeTimeMinutes.toFixed(2)),
            distractedTimeMinutes: Number(summary.distractedTimeMinutes.toFixed(2)),
            idleTimeMinutes: Number(summary.idleTimeMinutes.toFixed(2)),
            lastSeen: summary.lastSeen
        });

    } catch (err) {
        console.error('❌ Error handling metrics pipelines:', err);
    }
});

// 📊 5. ANALYTICS DATASET FEED ENDPOINT
app.get('/api/analytics-dataset', async (req, res) => {
    try {
        const datasets = await EmployeeSummary.find({}).lean().exec();
        
        const formattedData = datasets.map(row => ({
            employeeId: row.employeeId,
            ipAddress: row.ipAddress,
            activeTimeMinutes: Number((row.activeTimeMinutes || 0).toFixed(2)),
            distractedTimeMinutes: Number((row.distractedTimeMinutes || 0).toFixed(2)),
            idleTimeMinutes: Number((row.idleTimeMinutes || 0).toFixed(2)),
            lastSeen: row.lastSeen || 'Not Active Yet'
        }));

        res.json(formattedData);
    } catch (err) {
        res.status(500).json({ error: 'Failed to query analytics indices' });
    }
});

// 🛠️ 6. ADMIN STRATEGIC MANAGEMENT ROUTE (Admin Panel Action Handlers)
// Lets you purge test entries or delete specific employee records from your board UI
app.delete('/api/admin/purge-employee/:id', async (req, res) => {
    const targetUser = req.params.id;
    try {
        await EmployeeSummary.deleteOne({ employeeId: targetUser });
        await TrackLog.deleteMany({ employeeId: targetUser });
        // Lock the query to only show data accumulated today
const todayDateString = `${year}-${month}-${day}`;
let queryFilter = { date: todayDateString };
        logger.warning(`ADMIN ACTION | Purged worker record entirely: ${targetUser}`);
        
        // Notify the dashboard interface to instantly remove the row visually
        io.emit('employee-purged', { employeeId: targetUser });
        res.sendStatus(200);
    } catch (err) {
        res.status(500).json({ error: 'Administrative deletion pipeline failed' });
    }
});

app.use('/static', express.static(path.join(__dirname, 'tracker_files'))); // added for the installation of the extension

server.listen(4000, () => {
    console.log('🚀 MongoDB High-Performance Cluster Ingest feeding http://localhost:4000');
});