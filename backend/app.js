// backend/app.js

// ─── 1. Load env & core modules ───────────────────────────────────────────
const path       = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const express    = require('express');
const http       = require('http');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const cors       = require('cors');
const bodyParser = require('body-parser');
const xss        = require('xss-clean');

// ─── 2. Socket.IO bootstrap (no circular require) ───────────────────────
const { init: initIo, getIo } = require('./io');
const io = initIo(server);

// ─── 3. Middleware & routes imports ──────────────────────────────────────
const anomaly          = require('./middleware/anomaly');
const authenticate     = require('./middleware/authenticate');

const authRoutes       = require('./routes/auth');
const userRoutes       = require('./routes/users');
const attendanceRoutes = require('./routes/attendance');
const locationRoutes   = require('./routes/location');
const leaveRoutes      = require('./routes/leaves');
const dashboardRoutes  = require('./routes/dashboard');
const backupRouter     = require('./routes/backup');

const { sequelize, User, LocationCheck } = require('./models');
const { scheduleJobsFor }                = require('./controllers/locationController');

const bcrypt = require('bcrypt');
const { Op } = require('sequelize');

const webpush = require('web-push');
webpush.setVapidDetails(
  'mailto:abhishek20040916@gmail.com',
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

const PORT = process.env.PORT || 3000;

// ─── 4. Create Express app & HTTP server ─────────────────────────────────
const app = express();
const server = http.createServer(app);

// ─── 5. GLOBAL MIDDLEWARE ────────────────────────────────────────────────
const allowedOrigins = [
  'https://faithcenterams.up.railway.app',
  'http://localhost',
  'https://localhost',
  'capacitor://localhost',
  'ionic://localhost'
];

const corsOptions = {
  origin: function (origin, callback) {
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



// 5.2 Security headers
app.use(helmet());

// 5.3 Rate limiting
const loginLimiter = rateLimit({
  windowMs:  60_000,
  max:       20_000,
  message:   { message: 'Too many login attempts, please wait a minute.' }
});
const apiLimiter = rateLimit({
  windowMs:  15 * 60_000,
  max:       100_000,
  message:   { message: 'Too many API requests, please try again later.' }
});

// 5.4 Body parser & XSS
app.use(bodyParser.json({ limit: '10kb' }));
app.use(xss());

// 5.5 Slow‐request logger
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    if (ms > 5000) {
      console.warn(`[SLOW] ${req.method} ${req.originalUrl} took ${ms}ms`);
    }
  });
  next();
});

// 5.6 Mutating‐request logger
app.use((req, res, next) => {
  if (['POST','PUT','PATCH','DELETE'].includes(req.method)) {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`, req.body);
  }
  next();
});

// 5.7 Anomaly detector
app.use(anomaly);

// ─── 6. Initialize Socket.IO ─────────────────────────────────────────────


// ─── 7. API ROUTES ────────────────────────────────────────────────────────
// Public auth
app.use('/api/auth', loginLimiter, authRoutes);

// Protected
app.use('/api/users',      apiLimiter, authenticate, userRoutes);
app.use('/api/attendance', apiLimiter, authenticate, attendanceRoutes);
app.use('/api/location',   apiLimiter, authenticate, locationRoutes);
app.use('/api/leaves',     apiLimiter, authenticate, leaveRoutes);
app.use('/api/dashboard',  apiLimiter, authenticate, dashboardRoutes);

app.use('/api/backup', apiLimiter, backupRouter);

// Tighten CSP if desired
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'", "https://unpkg.com", "https://cdn.jsdelivr.net"],
      styleSrc:   ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:    ["'self'", "https://fonts.gstatic.com", "data:"],
      imgSrc:     ["'self'", "data:"],
      connectSrc: ["'self'"]
    }
  }
}));

// ─── 8. SPA ASSETS & FALLBACK ────────────────────────────────────────────
app.use('/css',    express.static(path.join(__dirname, '../frontend/css')));
app.use('/js',     express.static(path.join(__dirname, '../frontend/js')));
app.use('/assets', express.static(path.join(__dirname, '../frontend/assets')));
app.use('/',       express.static(path.join(__dirname, '../frontend/public')));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ message: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

// ─── 9. Global error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err.stack || err);
  res.status(500).json({ message: 'Internal server error' });
});

// ─── 10. Bootstrap defaults & start ──────────────────────────────────────
async function createDefaultUsers() {
  const defaults = [
    {
      name:         'Admin',
      email:        'admin@gmail.com',
      phone:        '9000327849',
      username:     'ADMIN1@FC',
      uid:          '2534567891',
      password:     'admin1',
      role:         'admin',
      categoryType: 'admin',
      gender:       'male',
      age:          '21'
    },
    {
      name:         'Developer',
      email:        'developer@gmail.com',
      phone:        '9381135838',
      username:     'DEVELOPER1@FC',
      uid:          '2534567892',
      password:     'developer1',
      role:         'developer',
      categoryType: 'developer',
      gender:       'male',
      age:          '21'
    }
  ];

  for (const u of defaults) {
    const [usr, created] = await User.findOrCreate({
      where: { [Op.or]: [{ email: u.email }, { phone: u.phone }] },
      defaults: {
        ...u,
        password: await bcrypt.hash(u.password, 10),
        usernameChangedAt: new Date()
      }
    });
    console.log(
      created
        ? `✔ Default ${u.role} created: ${u.email}`
        : `ℹ️ Default ${u.role} already exists`
    );
  }
}

(async () => {
  try {
    await sequelize.sync();
    await createDefaultUsers();

    // re‐install location jobs safely
    const allChecks = await LocationCheck.findAll();
    for (const loc of allChecks) {
      try {
        scheduleJobsFor(loc);
      } catch (err) {
        console.error('❌ scheduleJobsFor failed for', loc.id, err);
      }
    }

    server.listen(PORT, () => {
      console.log(`🚀 Server listening at http://localhost:${PORT}`);
    });
  } catch (startupErr) {
    console.error('❌ Startup error:', startupErr);
    process.exit(1);
  }
})();
