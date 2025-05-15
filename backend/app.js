// backend/app.js

// 1️⃣ Load environment variables from the project-root .env
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const bodyParser = require('body-parser');
const xss = require('xss-clean');

const anomaly = require('./middleware/anomaly');
const authenticate = require('./middleware/authenticate');

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const attendanceRoutes = require('./routes/attendance');
const qrRoutes = require('./routes/qr');
const leaveRoutes = require('./routes/leaves');
const dashboardRoutes = require('./routes/dashboard');
const presetRoutes = require('./routes/preset');
const backupRouter = require('./routes/backup');

const { sequelize, User } = require('./models');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');

const app = express();
const PORT = process.env.PORT || 3000;

/* ─── GLOBAL MIDDLEWARE ───────────────────────────────────────────────────── */

// 1) Strong security headers
app.use(helmet());

// define limiters
const loginLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    message: { message: 'Too many login attempts, please wait a minute.' }
});
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: 'Too many API requests, please try again later.' }
});

// 3) CORS: restrict to your domains
app.use(cors({
    origin: ['https://your-frontend.com', 'https://admin.yoursite.com']
}));

// 4) JSON parser with size limit
app.use(bodyParser.json({ limit: '10kb' }));

// 5) XSS sanitization
app.use(xss());

// 6) Simple logger for POST/PUT/PATCH
app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`, req.body);
    }
    next();
});

// 7) Anomaly detector (auto-email, nuke & self-heal)
app.use(anomaly);

/* ─── API ROUTES ───────────────────────────────────────────────────────────── */

// Public authentication
app.use('/api/auth', authRoutes);

// Protected endpoints
app.use('/api/users', authenticate, userRoutes);
app.use('/api/attendance', authenticate, attendanceRoutes);
app.use('/api/qr', authenticate, qrRoutes);
app.use('/api/leaves', authenticate, leaveRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);
app.use('/api/presets', authenticate, presetRoutes);
app.use('/api/backup', backupRouter);
app.use(
    helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                // Allow data: for embedded fonts
                fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
                imgSrc: ["'self'", "data:"],
                connectSrc: ["'self'"]
            }
        }
    })
);


/* ─── SERVE FRONT-END ASSETS & SPA FALLBACK ────────────────────────────────── */

// Static asset folders
app.use('/css', express.static(path.join(__dirname, '../frontend/css')));
app.use('/js', express.static(path.join(__dirname, '../frontend/js')));
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));
app.use('/', express.static(path.join(__dirname, '../frontend/public')));

// Fallback to index.html for client-side routing (excluding /api/)
app.get('*', (req, res) => {
    if (req.path.startsWith('/api/')) {
        return res.status(404).json({ message: 'API route not found' });
    }
    res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

/* ─── GLOBAL ERROR HANDLER ─────────────────────────────────────────────────── */

app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err.stack || err);
    res.status(500).json({ message: 'Internal server error' });
});

/* ─── BOOTSTRAP DEFAULT USERS & START SERVER ───────────────────────────────── */

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
                name: u.name,
                email: u.email,
                phone: u.phone,
                username: u.username,
                uid: u.uid,
                password: await bcrypt.hash(u.password, 10),
                role: u.role,
                categoryType: u.categoryType,
                gender: u.gender,
                age: u.age,
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
        await sequelize.sync({ alter: true });

        console.log('✔ Database synced');
        await createDefaultUsers();
        app.listen(PORT, () => {
            console.log(`🚀 Server listening at http://localhost:${PORT}`);
        });
    } catch (err) {
        console.error('❌ Startup error:', err);
        process.exit(1);
    }
})();