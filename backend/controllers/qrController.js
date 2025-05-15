// controllers/qr.js
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

    const now = new Date();
    const liveAt = now;
    const expiresAt = new Date(now.getTime() + durationMinutes * 60000);
    const token = generateToken();

    // persist full set of fields
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

    // schedule “absent” marking after duration + 45m buffer
    const absentTime = new Date(liveAt.getTime() + (durationMinutes + 45) * 60000);
    schedule.scheduleJob(absentTime, async() => {
        // pick users in scope
        const filter = (role === 'category-admin') ?
            { categoryType: req.user.categoryType } :
            {};
        const allUsers = await User.findAll({ where: filter, attributes: ['id'] });
        const allIds = allUsers.map(u => u.id);

        // who already punched‑in in window
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

        // mark the rest absent, tie to this QR token
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

    // return everything front‑end needs
    res.json({
        token,
        issuedBy: qr.issuedBy,
        liveAt,
        expiresAt,
        earlyWindow,
        lateWindow,
        duration: durationMinutes,
        earlyMsg,
        onTimeMsg,
        lateMsg,
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

module.exports = { createQR, getActiveQR };