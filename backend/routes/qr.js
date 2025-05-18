// routes/qr.js
const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const {
    createQR,
    getActiveQR,
    cancelQR
} = require('../controllers/qrController');

// 1) Generate a new QR (admins/devs only)
router.post('/generate', authenticate, createQR);

// 2) Fetch the currently active QR (scannable window)
router.get('/active', authenticate, getActiveQR);

// 3) Cancel (delete) a QR by its token
router.delete('/:token', authenticate, cancelQR);

module.exports = router;