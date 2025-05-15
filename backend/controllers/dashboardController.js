// backend/controllers/dashboardController.js
// -------------------------------------------------------------
const { User, Attendance, LeaveRequest } = require('../models');
const { Op } = require('sequelize');

/** GET /api/dashboard?date=yyyy-mm-dd&view=myself|team */
async function getStats(req, res, next) {
    try {
        // ---------------------------- current user
        const { id: userId, role, categoryType } = req.user;
        const me = await User.findByPk(userId, {
            attributes: ['id', 'name', 'gender', 'age', 'role', 'categoryType']
        });
        if (!me) return res.status(404).json({ message: 'User not found' });

        // ---------------------------- query params
        const isoDate = (req.query.date || new Date().toISOString().slice(0, 10)).slice(0, 10);
        const rawView = (req.query.view === 'myself') ? 'myself' : 'team';
        // only category‑admins actually get “myself”
        const view = (role === 'category-admin') ? rawView : 'team';

        // day & month ranges
        const dayStart = new Date(isoDate);
        const dayEnd = new Date(isoDate);
        dayEnd.setHours(23, 59, 59, 999);
        const monthStart = new Date(dayStart.getFullYear(), dayStart.getMonth(), 1);
        const monthEnd = new Date(dayStart.getFullYear(), dayStart.getMonth() + 1, 0, 23, 59, 59, 999);

        // ---------------------------- build user filter
        let userWhere = {};
        switch (role) {
            case 'developer':
                // all except self
                userWhere.id = {
                    [Op.ne]: userId };
                break;
            case 'admin':
                // only category‑admins + ushers
                userWhere.role = {
                    [Op.in]: ['category-admin', 'usher'] };
                break;
            case 'category-admin':
                if (view === 'myself') {
                    userWhere.id = userId;
                } else {
                    if (!categoryType) return res.json(emptyPayload(me));
                    userWhere = { role: 'usher', categoryType };
                }
                break;
            default:
                // ushers/members → only themselves
                userWhere.id = userId;
        }

        // ---------------------------- collect IDs for attendance & leaves
        let attendWhere = {};
        let leaveWhere = {};

        // dev & (admin+team) use the broad userWhere directly
        if (!(role === 'developer' || (role === 'admin' && view === 'team'))) {
            const ids = await User.findAll({
                where: userWhere,
                attributes: ['id']
            }).then(rows => rows.map(r => r.id));
            // ensure non‑empty array
            attendWhere.userId = leaveWhere.userId = {
                [Op.in]: ids.length ? ids : [null] };
        }

        // ---------------------------- parallel data fetch
        const [
            totalUsers,
            dayRecords,
            monthRecords,
            allLeaves
        ] = await Promise.all([
            // team size
            User.count({ where: userWhere }),

            // today's attendance (scoped)
            Attendance.findAll({
                where: {
                    ...attendWhere,
                    timestamp: {
                        [Op.between]: [dayStart, dayEnd] }
                }
            }),

            // entire month's attendance (unscoped), with user.role
            Attendance.findAll({
                where: { timestamp: {
                        [Op.between]: [monthStart, monthEnd] } },
                include: [{
                    model: User,
                    as: 'user',
                    attributes: ['role'],
                    required: true
                }]
            }),

            // all leave requests for the scope
            LeaveRequest.findAll({ where: leaveWhere })
        ]);

        // ---------------------------- compute metrics
        const punchIns = dayRecords.filter(r => r.type === 'punch-in').length;
        const punchOuts = dayRecords.filter(r => r.type === 'punch-out').length;
        const lates = dayRecords.filter(r => r.status === 'late').length;
        const earlies = dayRecords.filter(r => r.status === 'early').length;
        const onTimes = dayRecords.filter(r => r.status === 'on-time').length;
        const pendingLeaves = allLeaves.filter(l => l.status === 'pending').length;

        // ---------------------------- assemble calendar dots
        const reds = new Set(); // admin
        const greens = new Set(); // category‑admin
        const blues = new Set(); // developer
        monthRecords.forEach(r => {
            const day = r.timestamp.toISOString().slice(0, 10);
            switch (r.user.role) {
                case 'admin':
                    reds.add(day);
                    break;
                case 'category-admin':
                    greens.add(day);
                    break;
                case 'developer':
                    blues.add(day);
                    break;
            }
        });
        const attendanceDates = [
            ...new Set(monthRecords.map(r => r.timestamp.toISOString().slice(0, 10)))
        ];

        // ---------------------------- send response
        res.json({
            user: me,
            totalUsers: view === 'team' ? totalUsers : undefined,
            punchIns,
            punchOuts,
            lates,
            earlies,
            onTimes,
            totalLeaves: allLeaves.length,
            pendingLeaves,
            attendanceDates,
            redDates: [...reds],
            greenDates: [...greens],
            blueDates: [...blues]
        });

    } catch (err) {
        next(err);
    }
}

// helper for category‑admins with no category yet
function emptyPayload(user) {
    return {
        user,
        totalUsers: 0,
        punchIns: 0,
        punchOuts: 0,
        lates: 0,
        earlies: 0,
        onTimes: 0,
        totalLeaves: 0,
        pendingLeaves: 0,
        attendanceDates: []
    };
}

module.exports = { getStats };