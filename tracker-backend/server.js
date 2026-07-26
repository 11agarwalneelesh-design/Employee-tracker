/**
 * ============================================================================
 * ENTERPRISE TELEMETRY BACKEND SERVER
 * Handles WebSocket real-time updates, MongoDB ingest, and Authentication.
 * ============================================================================
 */

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
const io = new Server(server, { cors: { origin: "*" } });

// 🪵 1. LOGGING CONFIGURATION: Rolls over daily and keeps 14 days of backups
const fileRotateTransport = new winston.transports.DailyRotateFile({
    filename: path.join(__dirname, 'logs', 'activity-%DATE%.log'),
    datePattern: 'YYYY-MM-DD', 
    maxFiles: '14d',           
    zippedArchive: true,       
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

// 💾 2. DATABASE CONNECTION
// 👇 YAHAN CHANGE KIYA HAI: process.env.MONGO_URI add kiya gaya hai
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://11agarwalneelesh_db_user:Neelesh_2026@cluster0.hvev2rd.mongodb.net/?appName=Cluster0';
mongoose.connect(MONGO_URI)
    .then(() => console.log('💾 Connected to MongoDB Successfully via Mongoose'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));


// 📝 3. DATABASE SCHEMAS

// A. User Authentication Schema (Sign Up, Log In, Password Reset)
const UserAuthSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true }, 
    role: { type: String, default: 'user' },
    resetOtp: { type: String },           // Holds the 6-digit code for password resets
    otpExpiry: { type: Date },            // Expiration timestamp for the code
    createdAt: { type: Date, default: Date.now }
});
const UserAuth = mongoose.model('UserAuth', UserAuthSchema);

// B. Raw Activity Log Schema (Every single status change event)
const TrackLogSchema = new mongoose.Schema({
    employeeId: { type: String, required: true, index: true },
    status: { type: String, required: true },
    ipAddress: { type: String, required: true },
    timestamp: { type: Date, default: Date.now }
});
const TrackLog = mongoose.model('TrackLog', TrackLogSchema);

// C. UNIFIED DAILY SCHEMA: Acts as both Live Tracker (for today) and History (for past dates)
const DailySummarySchema = new mongoose.Schema({
    employeeId: { type: String, required: true, index: true },
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    activeTimeMinutes: { type: Number, default: 0.0 },
    distractedTimeMinutes: { type: Number, default: 0.0 },
    idleTimeMinutes: { type: Number, default: 0.0 },
    ipAddress: { type: String, default: 'Unknown IP' },
    lastSeen: { type: String, default: 'Not Active Yet' }
});
DailySummarySchema.index({ employeeId: 1, date: 1 }, { unique: true });
const DailySummary = mongoose.model('DailySummary', DailySummarySchema);


// 🔐 4. AUTHENTICATION ENDPOINTS

// Route: Sign Up (Create new account)
app.post('/api/auth/signup', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
        
        const existingUser = await UserAuth.findOne({ email });
        if (existingUser) return res.status(400).json({ error: 'User account already exists' });

        await UserAuth.create({ email, password, role: 'user' });
        res.status(201).json({ message: 'Account created successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error during signup' });
    }
});

// Route: Log In
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        // Master Admin Override
        if (email === 'admin' && password === 'admin123') {
            return res.json({ role: 'admin', email: 'admin' });
        }

        const user = await UserAuth.findOne({ email, password });
        if (!user) return res.status(401).json({ error: 'Invalid credentials provided' });

        res.json({ role: user.role, email: user.email });
    } catch (err) {
        res.status(500).json({ error: 'Internal server error during login' });
    }
});

// Route: Forgot Password (Prints 6-digit code to server console)
app.post('/api/auth/request-otp', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await UserAuth.findOne({ email });
        if (!user) return res.status(404).json({ error: 'Identity not found in system.' });

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        user.resetOtp = otp;
        user.otpExpiry = Date.now() + 10 * 60 * 1000; 
        await user.save();

        console.log(`\n=========================================`);
        console.log(`🔐 SECURITY ALERT: PASSWORD RESET REQUEST`);
        console.log(`👤 User: ${email}`);
        console.log(`🔑 OTP CODE: ${otp}`);
        console.log(`⏳ Expires in 10 minutes.`);
        console.log(`=========================================\n`);

        logger.warning(`OTP generated for ${email}: ${otp}`);

        res.json({ message: 'Security code generated. Please ask your administrator for the 6-digit code.' });
    } catch (err) {
        console.error("OTP Generation Error:", err);
        res.status(500).json({ error: 'Failed to generate security code.' });
    }
});

// Route: Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;
        const user = await UserAuth.findOne({ email, resetOtp: otp });

        if (!user || user.otpExpiry < Date.now()) {
            return res.status(400).json({ error: 'Invalid or expired security code.' });
        }

        user.password = newPassword;
        user.resetOtp = undefined; 
        user.otpExpiry = undefined;
        await user.save();

        res.json({ message: 'Password updated successfully. You may now log in.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to reset password.' });
    }
});


// 🌐 5. HIGH-PERFORMANCE EXTENSION INGEST API
app.post('/api/track-status', async (req, res) => {
    res.sendStatus(204); // Instantly free the Chrome Extension's network thread
    if (!req.body || !req.body.employeeId) return;

    const { employeeId, status } = req.body;
    if (employeeId === "Unknown_Employee") return;

    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';
    if (clientIp.includes(',')) clientIp = clientIp.split(',')[0].trim();
    if (clientIp.startsWith('::ffff:')) clientIp = clientIp.replace('::ffff:', '');
    const formattedIp = (clientIp === '::1' || clientIp === 'localhost') ? '127.0.0.1' : clientIp;

    const now = new Date();
    const localTimeString = now.toLocaleTimeString();
    
    // Force exact local timezone formatting for the midnight reset (YYYY-MM-DD)
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const todayDateString = `${year}-${month}-${day}`;

    try {
        const lastLog = await TrackLog.findOne({ employeeId }).sort({ _id: -1 }).exec();
        let durationMinutes = 0.0;
        if (lastLog) {
            const elapsedMs = now - lastLog.timestamp;
            durationMinutes = Math.min(elapsedMs / (1000 * 60), 2.0); // Cap at 2 mins max
        }

        await TrackLog.create({ employeeId, status, ipAddress: formattedIp });
        logger.info(`IP: ${formattedIp} | User: ${employeeId} | Status: ${status.toUpperCase()}`);

        let incField = 'distractedTimeMinutes';
        if (lastLog) {
            if (lastLog.status === 'Active on Target URL') incField = 'activeTimeMinutes';
            if (lastLog.status === 'Idle (System Inactive)') incField = 'idleTimeMinutes';
        }

        const updatePayload = { ipAddress: formattedIp };
        if (status === 'Active on Target URL') updatePayload.lastSeen = localTimeString;

        // Atomic Upsert: Automatically maps data to TODAY'S date. 
        // When midnight strikes, todayDateString changes, and a new record starts at 0 automatically.
        const summary = await DailySummary.findOneAndUpdate(
            { employeeId, date: todayDateString },
            { 
                $set: updatePayload, 
                $inc: { [incField]: durationMinutes } 
            },
            { returnDocument: 'after', upsert: true }
        );

        // Broadcast to React Dashboard
        io.emit('manager-update', {
            employeeId: summary.employeeId,
            status: status,
            ip: summary.ipAddress,
            activeTimeMinutes: Number(summary.activeTimeMinutes.toFixed(2)),
            distractedTimeMinutes: Number(summary.distractedTimeMinutes.toFixed(2)),
            idleTimeMinutes: Number(summary.idleTimeMinutes.toFixed(2)),
            lastSeen: summary.lastSeen || 'Not Active Yet'
        });

    } catch (err) {
        console.error('❌ Error handling metrics pipelines:', err);
    }
});


// 📊 6. ANALYTICS API: LIVE DASHBOARD (Strictly filters for TODAY only)
app.get('/api/analytics-dataset', async (req, res) => {
    try {
        const { user, role } = req.query;
        
        // Lock the query to only show data accumulated today
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayDateString = `${year}-${month}-${day}`;

        let queryFilter = { date: todayDateString };

        // Data Isolation: Normal users only see themselves
        if (role !== 'admin' && user) {
            queryFilter.employeeId = user;
        }

        const datasets = await DailySummary.find(queryFilter).lean().exec();
        
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
        res.status(500).json({ error: 'Failed to query live analytics' });
    }
});

// 📈 7. ANALYTICS API: DAILY HISTORY (Pulls all records for Export & Filtering)
app.get('/api/daily-stats', async (req, res) => {
    try {
        const { user, role } = req.query;
        let queryFilter = {};

        // Data Isolation: Normal users only see themselves
        if (role !== 'admin' && user) queryFilter = { employeeId: user };

        // Sort by date descending (newest first)
        const dailyData = await DailySummary.find(queryFilter).sort({ date: -1 }).lean().exec();
        
        const formattedData = dailyData.map(row => ({
            employeeId: row.employeeId,
            date: row.date,
            activeTimeMinutes: Number((row.activeTimeMinutes || 0).toFixed(2)),
            distractedTimeMinutes: Number((row.distractedTimeMinutes || 0).toFixed(2)),
            idleTimeMinutes: Number((row.idleTimeMinutes || 0).toFixed(2))
        }));

        res.json(formattedData);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch daily statistics' });
    }
});


// 🛠️ 8. ADMIN STRATEGIC MANAGEMENT ROUTE
app.delete('/api/admin/purge-employee/:id', async (req, res) => {
    const targetUser = req.params.id;
    try {
        await DailySummary.deleteMany({ employeeId: targetUser });
        await TrackLog.deleteMany({ employeeId: targetUser });
        logger.warning(`ADMIN ACTION | Purged worker record entirely: ${targetUser}`);
        io.emit('employee-purged', { employeeId: targetUser });
        res.sendStatus(200);
    } catch (err) {
        res.status(500).json({ error: 'Administrative deletion pipeline failed' });
    }
});

app.use('/static', express.static(path.join(__dirname, 'tracker_files'))); 

// 👇 YAHAN CHANGE KIYA HAI: process.env.PORT add kiya gaya hai
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
    console.log(`🚀 MongoDB High-Performance Cluster Ingest feeding port ${PORT}`);
});
