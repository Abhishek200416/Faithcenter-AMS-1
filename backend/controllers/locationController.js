const { User, Attendance, LocationCheck, PushSubscription } = require('../models')
const webpush = require('web-push')
const schedule = require('node-schedule')
const { Op } = require('sequelize')
const { getIo } = require('../io')

const scheduledJobs = new Map()
const jobKey = loc => loc.id.toString()

const sendPushNotification = async (sub, payload) =>
    webpush.sendNotification(sub, JSON.stringify(payload))

// ─── controllers/locationController.js ─────────────────────────────────

const scheduleJobsFor = async loc => {
    const key = loc.id.toString();
    const existing = scheduledJobs.get(key);
    // safely cancel any old jobs
    if (Array.isArray(existing)) {
        existing.forEach(job => job?.cancel());
    }

    // full-time checks don’t get scheduled
    if (loc.attendanceType === 'full') {
        scheduledJobs.delete(key);
        return;
    }

    // notifications via socket & push
    const io = getIo();
    const room = loc.category || 'global';
    const notify = async (phase, msg) => {
        io.to(room).emit('locationReminder', { message: msg, phase });
        await Promise.all(
            loc.userIds.map(async uid => {
                const subs = await PushSubscription.findAll({ where: { userId: uid } });
                await Promise.all(
                    subs.map(sub =>
                        sendPushNotification(sub, {
                            title:
                                phase === 'early'
                                    ? '🕑 Early Reminder'
                                    : phase === 'on-time'
                                        ? '✅ On-Time'
                                        : '⏳ Late Reminder',
                            body: msg,
                        })
                    )
                );
            })
        );
    };

    // Derive the base date from specificDate if provided, otherwise fallback to startAt
    let baseDate;
    if (loc.specificDate) {
        // YYYY-MM-DD → Date at local midnight
        const [Y, M, D] = loc.specificDate.split('-').map(Number);
        baseDate = new Date(Y, M - 1, D);
    } else {
        baseDate = new Date(loc.startAt);
    }

    // Parse the time part
    const [h, m] = (loc.startTime || '00:00').split(':').map(Number);
    // Combine date + time
    baseDate.setHours(h, m, 0, 0);

    const jobs = [];

    if (loc.scheduleType === 'once') {
        // early reminder
        jobs.push(
            schedule.scheduleJob(
                new Date(baseDate.getTime() - loc.earlyWindow * 60_000),
                () => notify('early', loc.earlyMsg)
            )
        );
        // on-time
        jobs.push(
            schedule.scheduleJob(baseDate, () => notify('on-time', loc.onTimeMsg))
        );
        // late + mark absent
        jobs.push(
            schedule.scheduleJob(
                new Date(baseDate.getTime() + (loc.duration + loc.lateWindow) * 60_000),
                async () => {
                    await notify('late', loc.lateMsg);
                    await markAbsent(loc);
                }
            )
        );
    } else {
        // weekly
        const dow = loc.daysOfWeek.map(d =>
            ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].indexOf(d.toLowerCase())
        );
        const baseRule = { dayOfWeek: dow, hour: h };

        // early
        jobs.push(
            schedule.scheduleJob(
                { ...baseRule, minute: m - loc.earlyWindow },
                () => notify('early', loc.earlyMsg)
            )
        );
        // on-time
        jobs.push(
            schedule.scheduleJob(
                { ...baseRule, minute: m },
                () => notify('on-time', loc.onTimeMsg)
            )
        );
        // late + absent
        jobs.push(
            schedule.scheduleJob(
                { ...baseRule, minute: m + loc.duration + loc.lateWindow },
                async () => {
                    await notify('late', loc.lateMsg);
                    await markAbsent(loc);
                }
            )
        );
    }

    scheduledJobs.set(key, jobs);
};


const markAbsent = async loc => {
    const start = loc.startAt
    const end = new Date(start.getTime() + loc.duration * 60000)
    const punches = await Attendance.findAll({
        where: {
            type: 'punch-in',
            locationCheckId: loc.id,
            timestamp: { [Op.between]: [start, end] },
        },
        attributes: ['userId'],
        group: ['userId'],
    })
    const seen = punches.map(r => r.userId)
    const allIds = loc.userIds.length
        ? loc.userIds
        : (await User.findAll({ attributes: ['id'] })).map(u => u.id)
    const toMark = allIds.filter(id => !seen.includes(id))
    await Promise.all(
        toMark.map(uid =>
            Attendance.create({
                userId: uid,
                locationCheckId: loc.id,
                type: 'punch-in',
                timestamp: end,
                status: 'absent',
                reason: null,
            })
        )
    )
}

const listLocations = async (req, res) => {
    const { role, categoryType } = req.user
    if (!['developer', 'admin', 'category-admin'].includes(role))
        return res.status(403).json({ message: 'Forbidden' })
    const where = role === 'category-admin' ? { category: categoryType } : {}
    const checks = await LocationCheck.findAll({
        where,
        order: [['startAt', 'DESC']],
    })
    res.json(checks)
}

const createLocation = async (req, res) => {
    const { role, categoryType, id: userId } = req.user
    if (!['developer', 'admin', 'category-admin'].includes(role))
        return res.status(403).json({ message: 'Forbidden' })
    let {
        attendanceType = 'normal',
        scheduleType = 'once',
        latitude,
        longitude,
        radius,
        daysOfWeek = [],
        specificDate = null,
        startTime,
        durationMinutes,
        outGrace,
        remindBeforeMins,
        earlyWindow,
        lateWindow,
        earlyMsg,
        onTimeMsg,
        lateMsg,
        userIds: rawUserIds = [],
    } = req.body

    if (attendanceType === 'full') {
        scheduleType = 'once'
        startTime = null
        durationMinutes = null
        remindBeforeMins = null
        earlyWindow = null
        lateWindow = null
        earlyMsg = null
        onTimeMsg = null
        lateMsg = null
    }

    // Example fixed code snippet for your createLocation method
    const allowed = (
        await User.findAll({
            where:
                role === 'category-admin'
                    ? { role: 'usher', categoryType }
                    : { role: { [Op.in]: ['usher', 'category-admin'] } },
            attributes: ['id'],
        })
    ).map(u => u.id);

    const userIds = rawUserIds.filter(id => allowed.includes(id))

    let startAt, expiresAt;
    if (attendanceType === 'full') {
        startAt = new Date();
        expiresAt = null;
        startTime = null;
    } else {
        if (!specificDate || !startTime || isNaN(Number(durationMinutes))) {
            return res.status(400).json({ message: 'Invalid date/time/duration for location check.' });
        }
        const [Y, M, D] = req.body.specificDate.split('-').map(Number);
        const [h, m] = req.body.startTime.split(':').map(Number);

        // Create a Date as if it’s IST
        // Assume user inputs in IST
        const localDate = new Date(Y, M - 1, D, h, m); // JS Date, but in local timezone (usually server timezone, but on most hosts, that's UTC anyway!)
        // Now shift by IST offset
        const istOffset = 5.5 * 60 * 60 * 1000;
        const startAt = new Date(localDate.getTime() - istOffset);


        // Now, for display, just use .toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })



        if (isNaN(startAt.getTime())) {
            return res.status(400).json({ message: 'Invalid startAt date/time.' });
        }
        expiresAt = new Date(startAt.getTime() + Number(durationMinutes) * 60000);
    }


    const loc = await LocationCheck.create({
        latitude,
        longitude,
        radius,
        attendanceType,
        scheduleType,
        daysOfWeek,
        specificDate,
        startTime,
        duration: durationMinutes,
        outGrace,
        remindBeforeMins,
        earlyWindow,
        lateWindow,
        earlyMsg,
        onTimeMsg,
        lateMsg,
        startAt,
        expiresAt,
        category: role === 'category-admin' ? categoryType : null,
        issuedBy: userId,
        userIds,
        isDefault: ['developer', 'admin'].includes(role),
    })

    await scheduleJobsFor(loc)
    res.json(loc)
}

const getActiveLocations = async (req, res) => {
    const now = new Date()
    const where = {
        startAt: { [Op.lte]: now },
        expiresAt: { [Op.gt]: now },
    }
    if (['member', 'usher'].includes(req.user.role))
        where[Op.or] = [{ category: null }, { category: req.user.categoryType }]
    const loc = await LocationCheck.findOne({
        where,
        order: [['startAt', 'DESC']],
    })
    if (!loc) return res.status(404).json({ message: 'No active location check' })
    res.json(loc)
}

const cancelLocation = async (req, res) => {
    const loc = await LocationCheck.findByPk(req.params.id)
    if (!loc) return res.status(404).json({ message: 'Not found' })
    if (!['developer', 'admin', 'category-admin'].includes(req.user.role))
        return res.status(403).json({ message: 'Forbidden' })
    if (loc.isDefault && !['developer', 'admin'].includes(req.user.role))
        return res.status(403).json({ message: 'Cannot delete default check' })

    const jobs = scheduledJobs.get(loc.id.toString()) || [];
    jobs.forEach(job => job?.cancel());
    scheduledJobs.delete(loc.id.toString());

    await Attendance.destroy({
        where: { timestamp: { [Op.between]: [loc.startAt, loc.expiresAt] } },
    })
    await loc.destroy()
    res.json({ message: 'Cancelled' })
}

const updateLocation = async (req, res) => {
    const loc = await LocationCheck.findByPk(req.params.id)
    if (!loc) return res.status(404).json({ message: 'Not found' })
    if (!['developer', 'admin', 'category-admin'].includes(req.user.role))
        return res.status(403).json({ message: 'Forbidden' })

    let { attendanceType = loc.attendanceType, scheduleType = loc.scheduleType } = req.body
    if (attendanceType === 'full') scheduleType = 'weekly'

    let startAt, expiresAt, startTime = req.body.startTime;
    if (attendanceType === 'full') {
        startAt = new Date();
        expiresAt = null;
        startTime = null;
    } else {
        // Validate specificDate and startTime
        if (!req.body.specificDate || !req.body.startTime || isNaN(Number(req.body.durationMinutes))) {
            return res.status(400).json({ message: 'Invalid date/time/duration for location check.' });
        }
        // If fields valid, continue:
        startAt = new Date(`${req.body.specificDate}T${req.body.startTime}:00`);
        if (isNaN(startAt.getTime())) {
            return res.status(400).json({ message: 'Invalid startAt date/time.' });
        }
        expiresAt = new Date(startAt.getTime() + Number(req.body.durationMinutes) * 60000);
    }


    Object.assign(loc, {
        latitude: req.body.latitude,
        longitude: req.body.longitude,
        radius: req.body.radius,
        attendanceType,
        scheduleType,
        daysOfWeek: req.body.daysOfWeek || [],
        specificDate: req.body.specificDate || null,
        startTime,
        duration: req.body.durationMinutes,
        outGrace: req.body.outGrace,
        remindBeforeMins: req.body.remindBeforeMins,
        earlyWindow: req.body.earlyWindow,
        lateWindow: req.body.lateWindow,
        earlyMsg: req.body.earlyMsg,
        onTimeMsg: req.body.onTimeMsg,
        lateMsg: req.body.lateMsg,
        startAt,
        expiresAt,
        userIds: req.body.userIds || [],
    })

    await loc.save()
    await scheduleJobsFor(loc)
    res.json(loc)
}

module.exports = {
    listLocations,
    createLocation,
    getActiveLocations,
    cancelLocation,
    updateLocation,
    scheduleJobsFor,
}
