const { Attendance, User, LocationCheck } = require('../models');
const { Op } = require('sequelize');

function withinCircle(loc, latitude, longitude) {
    function toRad(x) { return x * Math.PI / 180; }
    const dLat = toRad(latitude - loc.latitude);
    const dLng = toRad(longitude - loc.longitude);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRad(loc.latitude)) * Math.cos(toRad(latitude))
        * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = 6371000 * c;
    return distance <= loc.radius;
}

function ensureDeveloper(req, res, next) {
    if (req.user.role !== 'developer') {
        return res.status(403).json({ message: 'Forbidden � developers only' });
    }
    next();
}

const punchOutState = new Map();

async function punch(req, res, next) {
    try {
        // only Ushers and Category-Admins may actually be tracked
        if (!['usher', 'category-admin'].includes(req.user.role)) {
            return res.status(403).json({
                message: 'Attendance punching is only available to Ushers and Category-Admins'
            });
        }
        const { latitude, longitude, reason } = req.body;
        if (latitude == null || longitude == null) {
            return res.status(400).json({ message: 'latitude & longitude are required' });
        }

        const now = new Date();

        const checks = await LocationCheck.findAll({
            where: {
                expiresAt: { [Op.gt]: now }
            }
        });

        let foundLoc = null;
        for (const loc of checks) {
            const inCircle = withinCircle(loc, latitude, longitude);
            const distance = haversineDistance(latitude, longitude, loc.latitude, loc.longitude);
            const earlyStart = new Date(loc.startAt.getTime() - loc.earlyWindow * 60_000);
            const sessionEnd = new Date(loc.startAt.getTime() + loc.duration * 60_000);

            console.log('Now:', now.toISOString());
            console.log('Allowed Punch Window:', earlyStart.toISOString(), '—', sessionEnd.toISOString());
            console.log('Distance:', distance, 'In circle:', inCircle);

            if (now > sessionEnd) {
                console.log('Too late, session ended.');
                continue;
            }

            // Only check for sessionEnd upper limit.
            // Don't block before earlyStart — tag as "early".


            if (inCircle) {
                foundLoc = loc;
                break;
            }
        }


        if (!foundLoc) {
            return res.status(404).json({ message: 'No active location check here' });
        }

        // Continue your punch logic normally...
        function haversineDistance(lat1, lon1, lat2, lon2) {
            function toRad(x) { return x * Math.PI / 180; }
            const R = 6371000; // meters
            const dLat = toRad(lat2 - lat1);
            const dLon = toRad(lon2 - lon1);
            const a = Math.sin(dLat / 2) ** 2 +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLon / 2) ** 2;
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }


        const startAt = foundLoc.startAt;
        const earlyStart = new Date(startAt.getTime() - foundLoc.earlyWindow * 60000);
        const lateEnd = new Date(startAt.getTime() + foundLoc.lateWindow * 60000);
        const sessionEnd = new Date(startAt.getTime() + foundLoc.duration * 60000);


        const dayStart = new Date(startAt);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setHours(23, 59, 59, 999);

        const punchedIn = await Attendance.findOne({
            where: {
                userId: req.user.id,
                type: 'punch-in',
                timestamp: { [Op.between]: [dayStart, dayEnd] }
            }
        });

        const punchedOut = punchedIn && await Attendance.findOne({
            where: {
                userId: req.user.id,
                type: 'punch-out',
                locationCheckId: foundLoc.id
            }
        });

        if (foundLoc.attendanceType === 'full') {
            const record = await Attendance.create({
                userId: req.user.id,
                locationCheckId: foundLoc.id,
                type: punchedIn ? 'punch-out' : 'punch-in',
                timestamp: now,
                status: null,
                reason: reason || null
            });
            return res.json({ recorded: true, id: record.id });
        }

        if (!punchedIn) {
            if (now > sessionEnd) {
                return res.status(400).json({
                    message: 'Session ended; you have already been marked absent.'
                });
            }
            if (!withinCircle(foundLoc, latitude, longitude)) {
                return res.status(400).json({ message: 'You must be inside to punch in.' });
            }
            let status;
            if (now < earlyStart) status = 'early';
            else if (now <= lateEnd) status = 'on-time';
            else status = 'late';

            const rec = await Attendance.create({
                userId: req.user.id,
                locationCheckId: foundLoc.id,
                type: 'punch-in',
                timestamp: now,
                status,
                reason: reason || null
            });

            return res.json({ status, recorded: true, id: rec.id });
        }

        if (punchedIn && !punchedOut) {
            if (withinCircle(foundLoc, latitude, longitude)) {
                punchOutState.delete(req.user.id);
                return res.status(400).json({
                    message: 'To punch out, please move outside the radius'
                });
            }

            const punchKey = `${req.user.id}:${foundLoc.id}`;
            let exitInfo = punchOutState.get(punchKey);
            if (!exitInfo) {
                exitInfo = { locId: foundLoc.id, exitTime: now };
                punchOutState.set(punchKey, exitInfo);
            }

            const graceMins = foundLoc.outGrace ?? 5;
            const graceUntil = new Date(exitInfo.exitTime.getTime() + graceMins * 60000);

            if (now >= graceUntil) {
                const outRec = await Attendance.create({
                    userId: req.user.id,
                    locationCheckId: foundLoc.id,
                    type: 'punch-out',
                    timestamp: now,
                    status: null,
                    reason: reason || null
                });
                punchOutState.delete(punchKey);
                return res.json({ punchedOut: true, id: outRec.id });
            } else {
                const minsLeft = Math.ceil((graceUntil - now) / 60000);
                return res.status(400).json({
                    message: `You've left the area; wait ${minsLeft} more minute(s) before auto punch-out`
                });
            }
        }


        return res.status(400).json({ message: 'Unable to record punch' });
    } catch (err) {
        next(err);
    }
}

async function getHistory(req, res, next) {
    try {
        const { category, role, date, search, type, all } = req.query;
        const where = {}, userFilter = {};
        const moment = require('moment-timezone');

        // Always define dayStart
        let dayStart;
        if (!all && date) {
            dayStart = moment.tz(date, 'Asia/Kolkata').startOf('day').utc().toDate();
        } else {
            dayStart = new Date();
            dayStart.setHours(0, 0, 0, 0);
        }

        if (type && type !== 'all') where.type = type;
        if (category && category !== 'all') userFilter.categoryType = category;
        if (role && role !== 'all') userFilter.role = role;
        if (search) {
            userFilter[Op.or] = [
                { uid: { [Op.like]: `%${search}%` } },
                { name: { [Op.like]: `%${search}%` } },
                { email: { [Op.like]: `%${search}%` } }
            ];
        }
        // Only apply date filter if not an "all" query
        if (!all) {
            if (!date) return res.status(400).json({ message: "Missing date" });
            const istDayStart = moment.tz(date, 'Asia/Kolkata').startOf('day').utc().toDate();
            const istDayEnd = moment.tz(date, 'Asia/Kolkata').endOf('day').utc().toDate();
            where.timestamp = { [Op.between]: [istDayStart, istDayEnd] };
        }

        // enforce “who sees whom”
        if (req.user.role === 'developer') {
            // developers see everyone except themselves
            userFilter.id = { [Op.ne]: req.user.id };
        } else if (req.user.role === 'admin') {
            // admins see everyone except themselves and developers
            userFilter[Op.and] = [
                { id: { [Op.ne]: req.user.id } },
                { role: { [Op.ne]: 'developer' } }
            ];
        } else if (req.user.role === 'category-admin') {
            // category-admins see only their category’s ushers & category-admins
            userFilter.categoryType = req.user.categoryType;
            userFilter.role = { [Op.in]: ['usher', 'category-admin'] };
        } else if (req.user.role === 'usher') {
            // ushers see only their own punches
            userFilter.id = req.user.id;
        }
        const moment = require('moment-timezone');
        const istDayStart = moment.tz(date, 'Asia/Kolkata').startOf('day').utc().toDate();
        const istDayEnd = moment.tz(date, 'Asia/Kolkata').endOf('day').utc().toDate();

        // Now query:
        where.timestamp = { [Op.between]: [istDayStart, istDayEnd] };


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

        const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
        const monthEnd = new Date(dayStart.getFullYear(), dayStart.getMonth() + 1, 0, 23, 59, 59, 999);
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

        return res.json({
            records,
            attendanceDates: monthRecords.map(r => r.timestamp.toISOString().slice(0, 10))
        });
    } catch (err) {
        next(err);
    }
}

async function addRecord(req, res, next) {
    try {
        const { userIds, timestamp, type, status, reason, locationCheckId } = req.body;
        // Validate timestamp
        if (!timestamp) return res.status(400).json({ message: "timestamp is required (ISO string)" });
        const dateObj = new Date(timestamp);
        if (isNaN(dateObj.getTime())) return res.status(400).json({ message: "Invalid timestamp format" });

        // Bulk create for all selected users
        const created = await Promise.all(userIds.map(uid =>
            Attendance.create({
                userId: uid,
                locationCheckId,
                type,
                timestamp: dateObj,
                status: type === 'punch-out' ? null : status,
                reason: reason || null
            })
        ));
        res.status(201).json({ created: created.length });
    } catch (err) {
        next(err);
    }
}

async function updateRecord(req, res, next) {
    try {
        const { timestamp, status, reason } = req.body;
        const rec = await Attendance.findByPk(req.params.id);
        if (!rec) return res.status(404).json({ message: 'Not found' });

        const userRole = req.user.role;
        const isOwn = rec.userId === req.user.id;

        // Only admin/developer can update timestamp/status, otherwise only reason
        if (userRole !== 'developer' && userRole !== 'admin') {
            if (!isOwn || !['absent', 'late'].includes(rec.status)) {
                return res.status(403).json({
                    message: 'You can only add a reason for your own absent/late record.'
                });
            }
            const diff = Math.abs(Date.now() - new Date(rec.timestamp).getTime());
            if (diff > 3600000) {
                return res.status(400).json({
                    message: 'Reason can only be added within 1 hour of punch-in.'
                });
            }
            rec.reason = reason || null;
            await rec.save();
            return res.json({ updated: true });
        }

        // For admins/devs, update everything
        if (timestamp) {
            const dateObj = new Date(timestamp);
            if (isNaN(dateObj.getTime())) return res.status(400).json({ message: "Invalid timestamp format" });
            rec.timestamp = dateObj;
        }
        if (rec.type !== 'punch-out') rec.status = status;
        rec.reason = reason || null;
        await rec.save();

        res.json({ updated: true });
    } catch (err) {
        next(err);
    }
}
async function deleteRecord(req, res, next) {
    try {
        const rec = await Attendance.findByPk(req.params.id);
        if (!rec) return res.status(404).json({ message: 'Not found' });
        await rec.destroy();
        res.status(204).end();
    } catch (err) {
        next(err);
    }
}

module.exports = {
    ensureDeveloper,
    punch,
    getHistory,
    addRecord,
    updateRecord,
    deleteRecord
};
