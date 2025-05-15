// controllers/attendanceController.js

const { Attendance, QRCode, User } = require('../models');
const { Op } = require('sequelize');

/** POST /api/attendance/punch */
async function punch(req, res, next) {
    try {
        const { type, qrToken, status: clientStatus, reason } = req.body;
        const now = new Date();

        // 1) find the QR
        const qr = await QRCode.findOne({ where: { token: qrToken } });
        if (!qr) {
            return res.status(400).json({ message: 'Invalid QR token' });
        }

        // 2) check existing
        const existing = await Attendance.findOne({
            where: { userId: req.user.id, type, qrToken }
        });
        if (existing) {
            // allow reason update on late
            if (existing.status === 'late' && !existing.reason && reason) {
                existing.reason = reason;
                await existing.save();
                return res.json({ status: 'ok', updated: true });
            }
            return res.json({
                status: existing.status,
                already: true,
                reason: existing.reason || null
            });
        }

        // 3) decide status
        let status;
        if (clientStatus === 'absent') {
            status = 'absent';
        } else {
            const diff = now.getTime() - qr.liveAt.getTime();
            const lateWindowMs = (qr.lateWindow ?? qr.windowMinutes ?? 5) * 60000;
            if (diff < 0) status = 'early';
            else if (diff <= lateWindowMs) status = 'on-time';
            else status = 'late';
        }

        // 4) prompt for reason if late without one
        if (status === 'late' && !reason) {
            return res.status(202).json({
                status: 'late',
                windowMinutes: qr.lateWindow ?? qr.windowMinutes ?? 5
            });
        }

        // 5) record attendance
        await Attendance.create({
            userId: req.user.id,
            type,
            qrToken,
            timestamp: now,
            status,
            reason: reason || null
        });

        res.json({ status: 'ok', recorded: status });
    } catch (err) {
        next(err);
    }
}

/** GET /api/attendance/history */
async function getHistory(req, res, next) {
    try {
        const { category, role, date, search, type } = req.query;

        // — build filters
        const where = {};
        const userFilter = {};

        if (type && type !== 'all') where.type = type;
        if (category && category !== 'all') userFilter.categoryType = category;
        if (role && role !== 'all') userFilter.role = role;
        if (search) {
            userFilter[Op.or] = [
                { uid: { [Op.like]: `%${search}%` } },
                { name: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } },
            ];
        }

        // — date window for “today’s” records
        let dayStart = new Date(), dayEnd = new Date();
        if (date) {
            dayStart = new Date(date);
            dayEnd = new Date(date);
        }
        dayStart.setHours(0, 0, 0, 0);
        dayEnd.setHours(23, 59, 59, 999);
        where.timestamp = { [Op.between]: [dayStart, dayEnd] };

        // 1) fetch today’s attendances + users
        const records = await Attendance.findAll({
            where,
            include: [{
                model: User,
                as: 'user',
                where: userFilter,
                attributes: ['id', 'uid', 'name', ['categoryType', 'category'], 'role']
            }],
            order: [['timestamp', 'DESC']]
        });

        // 2) build month window for calendar
        const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
        const monthEnd = new Date(dayStart.getFullYear(), dayStart.getMonth() + 1, 0, 23, 59, 59, 999);

        // 3) fetch the month’s attendances (same user filter)
        const monthRecords = await Attendance.findAll({
            where: {
                ...where,
                timestamp: { [Op.between]: [monthStart, monthEnd] }
            },
            include: [{
                model: User,
                as: 'user',
                where: userFilter,
                attributes: ['id']
            }]
        });

        // 4) load all relevant QRCode entries in one go
        const tokens = [...new Set(monthRecords.map(r => r.qrToken))].filter(Boolean);
        const qrcodes = tokens.length
            ? await QRCode.findAll({
                where: { token: { [Op.in]: tokens } },
                attributes: ['token'],
                include: [{
                    model: User,
                    as: 'issuer',
                    attributes: ['role']
                }]
            })
            : [];

        // map token → issuer role
        const issuerByToken = qrcodes.reduce((m, qr) => {
            m[qr.token] = qr.issuer?.role;
            return m;
        }, {});

        // 5) collect per‑role date sets
        const redSet = new Set(); // admin‑issued
        const greenSet = new Set(); // category-admin‑issued
        const blueSet = new Set(); // developer‑issued

        monthRecords.forEach(r => {
            const iso = r.timestamp.toISOString().slice(0, 10);
            const issuerRole = issuerByToken[r.qrToken];
            if (issuerRole === 'admin') redSet.add(iso);
            else if (issuerRole === 'category-admin') greenSet.add(iso);
            else if (issuerRole === 'developer') blueSet.add(iso);
        });

        // 6) respond with everything needed
        res.json({
            records,
            attendanceDates: records.map(r => r.timestamp.toISOString().slice(0, 10)),
            redDates: [...redSet],
            greenDates: [...greenSet],
            blueDates: [...blueSet]
        });

    } catch (err) {
        next(err);
    }
}

module.exports = { punch, getHistory };
