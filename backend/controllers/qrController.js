// backend/controllers/qrController.js
const { QRCode, User, Attendance } = require('../models');
const { generateToken } = require('../utils/qrGenerator');
const schedule = require('node-schedule');
const { Op } = require('sequelize');

/** POST /api/qr/generate */
async function createQR(req, res) {
    const role = req.user.role;
    if (!['developer', 'admin', 'category-admin'].includes(role)) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    const {
        durationMinutes = 10,
            earlyWindow = 0,
            lateWindow = 0,
            earlyMsg = '',
            onTimeMsg = '',
            lateMsg = ''
    } = req.body;

    // Use the client-sent liveAt if you ever want to schedule future QRs;
    // here we keep your original “now = liveAt” behavior for backward compat.
    const now = new Date();
    const liveAt = now;
    const expiresAt = new Date(now.getTime() + durationMinutes * 60000);
    const token = generateToken();

    // Persist the QR
    const qr = await QRCode.create({
        token,
        issuedBy: req.user.id,
        liveAt,
        expiresAt,
        earlyWindow,
        lateWindow,
        duration: durationMinutes,
        earlyMsg,
        onTimeMsg,
        lateMsg,
        category: role === 'category-admin' ? req.user.categoryType : null
    });

    // Schedule “absent” marking (duration + buffer)
    const absentTime = new Date(liveAt.getTime() + (durationMinutes + 45) * 60000);
    schedule.scheduleJob(absentTime, async() => {
        const filter = (role === 'category-admin') ?
            { categoryType: req.user.categoryType } :
            {};

        // All users in scope
        const allUsers = await User.findAll({ where: filter, attributes: ['id'] });
        const allIds = allUsers.map(u => u.id);

        // Who already punched-in
        const seen = await Attendance.findAll({
            where: {
                type: 'punch-in',
                timestamp: {
                    [Op.between]: [liveAt, absentTime] }
            },
            attributes: ['userId'],
            group: ['userId']
        });
        const seenIds = seen.map(r => r.userId);

        // Mark the rest absent
        const toMark = allIds.filter(id => !seenIds.includes(id));
        await Promise.all(toMark.map(uid =>
            Attendance.create({
                userId: uid,
                type: 'punch-in',
                timestamp: absentTime,
                status: 'absent',
                reason: null,
                qrToken: token
            })
        ));
    });

    // Return all the bits the front end needs
    res.json({
        token,
        issuedBy: qr.issuedBy,
        liveAt: qr.liveAt,
        expiresAt: qr.expiresAt,
        earlyWindow: qr.earlyWindow,
        lateWindow: qr.lateWindow,
        duration: qr.duration,
        earlyMsg: qr.earlyMsg,
        onTimeMsg: qr.onTimeMsg,
        lateMsg: qr.lateMsg,
        category: qr.category
    });
}

/** GET /api/qr/active */
async function getActiveQR(req, res) {
    const now = new Date();
    const where = {
        liveAt: {
            [Op.lte]: now },
        expiresAt: {
            [Op.gt]: now }
    };

    if (['member', 'usher'].includes(req.user.role)) {
        where[Op.or] = [
            { category: null },
            { category: req.user.categoryType }
        ];
    }

    const qr = await QRCode.findOne({
        where,
        order: [
            ['liveAt', 'DESC']
        ]
    });

    if (!qr) {
        return res.status(404).json({ message: 'No active QR' });
    }

    res.json({
        token: qr.token,
        issuedBy: qr.issuedBy,
        liveAt: qr.liveAt,
        expiresAt: qr.expiresAt,
        earlyWindow: qr.earlyWindow,
        lateWindow: qr.lateWindow,
        duration: qr.duration,
        earlyMsg: qr.earlyMsg,
        onTimeMsg: qr.onTimeMsg,
        lateMsg: qr.lateMsg,
        category: qr.category
    });
}

/** DELETE /api/qr/:token */
async function cancelQR(req, res) {
    const { token } = req.params;
    const qr = await QRCode.findOne({ where: { token } });
    if (!qr) {
        return res.status(404).json({ message: 'QR not found' });
    }

    if (!['developer', 'admin', 'category-admin'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Forbidden' });
    }

    // Wipe out all attendances tied to this QR, then delete the QR
    await Attendance.destroy({ where: { qrToken: token } });
    await QRCode.destroy({ where: { token } });

    res.json({ message: 'QR cancelled and all associated attendance removed' });
}

module.exports = {
    createQR,
    getActiveQR,
    cancelQR
};