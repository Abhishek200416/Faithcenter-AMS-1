// backend/controllers/leaveController.js
const { LeaveRequest, User } = require('../models');
const { Op } = require('sequelize');

async function applyLeave(req, res) {
    const { fromDate, toDate, reason, requestTo } = req.body;
    const leave = await LeaveRequest.create({
        userId: req.user.id,
        fromDate,
        toDate,
        reason,
        requestTo // ← persist who to send to
    });
    res.status(201).json({ leave });
}

// backend/controllers/leaveController.js
async function listLeaves(req, res) {
    const { mode } = req.query;
    const where = {};
    const filterByTeam = (
        mode === 'team' &&
        req.user.role === 'category-admin'
    );

    if (filterByTeam) {
        // only leaves that targeted this category-admin
        where.requestTo = 'category-admin';
        // plus only those in their category
        const userFilter = { categoryType: req.user.categoryType };
        const leaves = await LeaveRequest.findAll({
            where,
            include: [{
                model: User,
                as: 'user',
                attributes: ['name'],
                where: userFilter
            }],
            order: [
                ['createdAt', 'DESC']
            ]
        });
        return res.json({ leaves });
    }

    // otherwise “myself” or other roles:
    if (!['developer', 'admin'].includes(req.user.role)) {
        where.userId = req.user.id;
    }
    const leaves = await LeaveRequest.findAll({
        where,
        include: [{ model: User, as: 'user', attributes: ['name'] }],
        order: [
            ['createdAt', 'DESC']
        ]
    });
    res.json({ leaves });
}


async function updateLeave(req, res) {
    // only admins/devs/category-admin may approve/reject
    if (!['developer', 'admin', 'category-admin'].includes(req.user.role))
        return res.status(403).json({ message: 'Forbidden' });

    const leave = await LeaveRequest.findByPk(req.params.id);
    if (!leave) return res.status(404).json({ message: 'Not found' });

    const { status, note } = req.body;
    if (!['approved', 'rejected'].includes(status))
        return res.status(400).json({ message: 'Invalid status' });

    leave.status = status;
    leave.note = note; // ← save the admin’s note
    await leave.save();

    res.json({ leave });
}

module.exports = { applyLeave, listLeaves, updateLeave };