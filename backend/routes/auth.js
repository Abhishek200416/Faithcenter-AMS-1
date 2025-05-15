const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const {
    login,
    sendLoginOtp,
    verifyLoginOtp,
    forgotPassword,
    resetPassword,
    changePassword
} = require('../controllers/authController');

// — LOGIN with password
router.post('/login', login);

// — LOGIN via OTP (no password change)
router.post('/login-otp', sendLoginOtp);
router.post('/verify-login-otp', verifyLoginOtp);

// — FORGOT / RESET flows (password‑change)
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// — DIRECT CHANGE (authenticated users)
router.post('/change-password', authenticate, changePassword);

module.exports = router;