const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express = require('express');
const http = require('http');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const bodyParser = require('body-parser');
const xss = require('xss-clean');

const { init: initIo } = require('./io');
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

const webpush = require('web-push');
webpush.setVapidDetails(
    'mailto:abhishek20040916@gmail.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

const app = express();
const server = http.createServer(app);
const io = initIo(server);

const allowedOrigins = [
    'https://faithcenterams.up.railway.app',
    'http://localhost',
    'https://localhost',
    'capacitor://localhost',
    'ionic://localhost'
];

const corsOptions = {
    origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 20_000, message: { message: 'Too many login attempts, please wait a minute.' } }), '/api/auth');
app.use(rateLimit({ windowMs: 15 * 60_000, max: 100_000, message: { message: 'Too many API requests, please try again later.' } }), '/api');
app.use(bodyParser.json({ limit: '10kb' }));
app.use(xss());
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        const ms = Date.now() - start;
        if (ms > 5000) console.warn(`[SLOW] ${req.method} ${req.originalUrl} took ${ms}ms`);
    });
    next();
});
app.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`, req.body);
    }
    next();
});
app.use(anomaly);

app.use('/api/auth', authRoutes);
app.use('/api/users', authenticate, userRoutes);
app.use('/api/attendance', authenticate, attendanceRoutes);
app.use('/api/location', authenticate, locationRoutes);
app.use('/api/leaves', authenticate, leaveRoutes);
app.use('/api/dashboard', authenticate, dashboardRoutes);
app.use('/api/backup', authenticate, backupRouter);

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

app.use((err, req, res, next) => {
    console.error('❌ Unhandled error:', err.stack || err);
    res.status(500).json({ message: 'Internal server error' });
});

async function createDefaultUsers() {
    const defaults = [
        {
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
            where: { [Op.or]: [{ email: u.email }, { phone: u.phone }] },
            defaults: {
                ...u,
                password: await bcrypt.hash(u.password, 10),
                usernameChangedAt: new Date()
            }
        });
        console.log(created ? `✔ Default ${u.role} created: ${u.email}` : `ℹ️ Default ${u.role} already exists`);
    }
}

(async () => {
    await sequelize.sync();
    await createDefaultUsers();

    const allChecks = await LocationCheck.findAll();
    for (const loc of allChecks) {
        try {
            scheduleJobsFor(loc);
        } catch (err) {
            console.error(`❌ scheduleJobsFor failed for ${loc.id}`, err);
        }
    }

    server.listen(process.env.PORT || 3000, () => {
        console.log(`🚀 Server listening on port ${process.env.PORT || 3000}`);
    });
})();
