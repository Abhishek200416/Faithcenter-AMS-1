// backend/controllers/authController.js

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { Op } = require('sequelize');
const { User, OTP } = require('../models');
const { sendOTP } = require('../utils/mailService');

/**
 * Returns true if the string is a valid UUID v1–v5.
 */
function isUUID(str) {
    return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$/.test(str);
}

/**
 * Look up a user by email, phone, uid, username or raw id (only if valid UUID).
 */
async function findUserByIdentifier(identifier) {
    const orConditions = [
        { email: identifier },
        { phone: identifier },
        { uid: identifier },
        { username: identifier }
    ];

    // Only include the primary-key 'id' lookup when the identifier is a valid UUID
    if (isUUID(identifier)) {
        orConditions.push({ id: identifier });
    }

    return User.findOne({
        where: {
            [Op.or]: orConditions
        }
    });
}

// ─── SEND LOGIN OTP (no password reset) ────────────────────────────────────────
async function sendLoginOtp(req, res) {
    const { identifier } = req.body;
    const user = await findUserByIdentifier(identifier);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await OTP.create({ userId: user.id, code, expiresAt });

    await sendOTP(user.email, code);
    res.json({ message: 'Login OTP sent' });
}

// ─── VERIFY LOGIN OTP ─────────────────────────────────────────────────────────
async function verifyLoginOtp(req, res) {
    const { identifier, code } = req.body;
    const user = await findUserByIdentifier(identifier);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otp = await OTP.findOne({
        where: {
            userId: user.id,
            code,
            expiresAt: {
                [Op.gte]: new Date()
            }
        }
    });
    if (!otp) return res.status(400).json({ message: 'Invalid or expired OTP' });

    // consume it
    await OTP.destroy({ where: { userId: user.id } });

    // issue JWT
    const token = jwt.sign({ sub: user.id, role: user.role },
        process.env.JWT_SECRET, { expiresIn: '8h' }
    );
    res.json({
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            categoryType: user.categoryType,
            uid: user.uid,
            username: user.username
        }
    });
}

// ─── STANDARD LOGIN (password) ────────────────────────────────────────────────
async function login(req, res) {
    const { identifier, password } = req.body;
    const user = await findUserByIdentifier(identifier);
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const matches = await bcrypt.compare(password, user.password);
    if (!matches) return res.status(401).json({ message: 'Invalid credentials' });

    const token = jwt.sign({ sub: user.id, role: user.role },
        process.env.JWT_SECRET, { expiresIn: '8h' }
    );
    res.json({
        token,
        user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            categoryType: user.categoryType,
            uid: user.uid,
            username: user.username
        }
    });
}

// ─── FORGOT PASSWORD (SEND RESET OTP) ─────────────────────────────────────────
async function forgotPassword(req, res) {
    const id = req.body.identifier || req.body.email;
    const user = await findUserByIdentifier(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await OTP.create({ userId: user.id, code, expiresAt });

    await sendOTP(user.email, code);
    res.json({ message: 'OTP sent to your email' });
}

// ─── RESET PASSWORD (VERIFY RESET OTP & SET NEW PW) ──────────────────────────
async function resetPassword(req, res) {
    const id = req.body.identifier || req.body.email;
    const { code, newPassword } = req.body;
    const user = await findUserByIdentifier(id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otp = await OTP.findOne({
        where: {
            userId: user.id,
            code,
            expiresAt: {
                [Op.gte]: new Date()
            }
        }
    });
    if (!otp) return res.status(400).json({ message: 'Invalid or expired OTP' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    await OTP.destroy({ where: { userId: user.id } });

    // auto-issue JWT
    const token = jwt.sign({ sub: user.id, role: user.role },
        process.env.JWT_SECRET, { expiresIn: '8h' }
    );
    res.json({ message: 'Password reset successful', token });
}

// ─── DIRECT CHANGE PASSWORD (AUTHENTICATED) ──────────────────────────────────
async function changePassword(req, res) {
    const user = await User.findByPk(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { oldPassword, newPassword } = req.body;
    const matches = await bcrypt.compare(oldPassword, user.password);
    if (!matches) return res.status(400).json({ message: 'Old password is incorrect' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();
    res.json({ message: 'Password changed successfully' });
}

module.exports = {
    login,
    sendLoginOtp,
    verifyLoginOtp,
    forgotPassword,
    resetPassword,
    changePassword
};