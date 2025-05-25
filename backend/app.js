// backend/app.js

// ─── 1. Load env & core modules ───────────────────────────────────────────
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const http = require('http');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const bodyParser = require('body-parser');
const xss = require('xss-clean');

// ─── 2. Socket.IO bootstrap (no circular require) ───────────────────────
const { init: initIo } = require('./io');

// ─── 3. Middleware & routes imports ──────────────────────────────────────
const anomaly = require('./middleware/anomaly');
const authenticate = require('./middleware/authenticate');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const attendanceRoutes = require('./routes/attendance');
const locationRoutes = require('./routes/location');
const leaveRoutes = require('./routes/leaves');
const dashboardRoutes = require('./routes/dashboard');

const backupRouter = require('./routes/backup');



const { sequelize, User, LocationCheck } = require('./models');
const { scheduleJobsFor } = require('./controllers/locationController');

const bcrypt = require('bcrypt');
const { Op } = require('sequelize');

const PORT = process.env.PORT || 3000;

const webpush = require('web-push');

webpush.setVapidDetails(
    'mailto:abhishek20040916@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

// ─── 4. Create Express app & HTTP server ─────────────────────────────────
const app = express();
app.set('trust proxy', 1); // 🛡 Trust first proxy (needed for rate limit to work)
console.log("Server Time:", new Date().toISOString());

const server = http.createServer(app);

// Increase timeout to 120 seconds (default is usually 60s)
server.setTimeout(120000);
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - start;
        if (duration > 5000) { // log if request takes more than 5 seconds
            console.warn(`[SLOW REQUEST] ${req.method} ${req.originalUrl} took ${duration} ms`);
        }
    });
    next();
});


// initialize Socket.IO
const io = initIo(server);
// make `io` available via `req.app.get('io')` or require('./io').getIo()
app.set('io', io);
// ─── let clients "join" a room so io.to(room).emit(...) will actually reach them
io.on('connection', socket => {
    socket.on('join', room => socket.join(room));
});

console.log(new Date().toString());

// ─── 5. GLOBAL MIDDLEWARE ────────────────────────────────────────────────
// 5.1 Security headers
app.use(helmet());

// 5.2 Rate limiters
const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20000, // 20,000 per minute
    message: { message: 'Too many login attempts, please wait a minute.' }
});
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100000, // 100,000 per 15 minutes
    message: { message: 'Too many API requests, please try again later.' }
});

// 5.3 CORS
app.use(cors({
    origin: [
        'https://faithcenter-ams-production.up.railway.app',
        'http://localhost:3000'
    ]
}));

// 5.4 Body parsing & XSS
app.use(bodyParser.json({ limit: '10kb' }));
app.use(xss());

// 5.5 Logger for mutating requests
app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`, req.body);
    }
    next();
});

// 5.6 Anomaly detector
app.use(anomaly);

// ─── 6. API ROUTES ────────────────────────────────────────────────────────
// Public auth
app.use('/api/auth', loginLimiter, authRoutes);

// Protected
app.use('/api/users', apiLimiter, authenticate, userRoutes);
app.use('/api/attendance', apiLimiter, authenticate, attendanceRoutes);
app.use('/api/location', apiLimiter, authenticate, locationRoutes);
app.use('/api/leaves', apiLimiter, authenticate, leaveRoutes);
app.use('/api/dashboard', apiLimiter, authenticate, dashboardRoutes);

app.use('/api/backup', apiLimiter, backupRouter);

// tighten CSP again after routes (if needed)
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"]
        }
    }
}));

// ─── 7. SPA ASSETS & FALLBACK ────────────────────────────────────────────
app.use('/css', express.static(path.join(__dirname, '../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));
app.use('/', express.static(path.join(__dirname, '../frontend/public')));

app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ message: 'API route not found' });
    }
    res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// ─── 8. Global error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err.stack || err);
    res.status(500).json({ message: 'Internal server error' });
});

// ─── 9. Bootstrap defaults & start server ─────────────────────────────────
async function createDefaultUsers() {
    const defaults = [{
            name: 'Admin',
            email: 'admin@gmail.com',
            phone: '9000327849',
            username: 'ADMIN1@FC',
            uid: '2534567891',
            password: 'admin1',
            role: 'admin',
            categoryType: 'admin',
            gender: 'male',
            age: '21'
        },
        {
            name: 'Developer',
            email: 'developer@gmail.com',
            phone: '9381135838',
            username: 'DEVELOPER1@FC',
            uid: '2534567892',
            password: 'developer1',
            role: 'developer',
            categoryType: 'developer',
            gender: 'male',
            age: '21'
        }
    ];

    for (const u of defaults) {
        const [user, created] = await User.findOrCreate({
            where: {
                [Op.or]: [{ email: u.email }, { phone: u.phone }]
            },
            defaults: {
                ...u,
                password: await bcrypt.hash(u.password, 10),
                usernameChangedAt: new Date()
            }
        });
        console.log(created ?
            `✔ Default ${u.role} created: ${u.email}` :
            `ℹ️ Default ${u.role} already exists`);
    }
}

(async() => {
    try {
        await sequelize.sync();
        await createDefaultUsers();

        // ─── Reinstall all scheduled jobs ─────────────────────────
        const allChecks = await LocationCheck.findAll();
        allChecks.forEach(loc => scheduleJobsFor(loc));

        server.listen(PORT, () => console.log(`🚀 Server listening at http://localhost:${PORT}`));
    } catch (err) {
        console.error('❌ Startup error:', err);
        process.exit(1);
    }
})();