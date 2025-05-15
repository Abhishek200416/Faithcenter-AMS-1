// backend/controllers/presetController.js
const { Preset } = require('../models');

/**
 * GET /api/presets
 *  → list all presets belonging to req.user
 */
async function listPresets(req, res) {
    try {
        const presets = await Preset.findAll({
            where: { userId: req.user.id },
            order: [
                ['createdAt', 'DESC']
            ],
        });
        res.json(presets);
    } catch (err) {
        console.error('listPresets error:', err);
        res.status(500).json({ message: 'Failed to load presets' });
    }
}

/**
 * GET /api/presets/:id
 *  → fetch a single preset by its ID (only if it belongs to req.user)
 */
async function getPreset(req, res) {
    try {
        const p = await Preset.findOne({
            where: {
                id: req.params.id,
                userId: req.user.id
            }
        });
        if (!p) return res.status(404).json({ message: 'Preset not found' });
        res.json(p);
    } catch (err) {
        console.error('getPreset error:', err);
        res.status(500).json({ message: 'Failed to load preset' });
    }
}

/**
 * POST /api/presets
 *  body: { name, date, time, ... }
 */
async function createPreset(req, res) {
    try {
        const {
            name,
            date,
            time,
            duration,
            early,
            late,
            absent,
            earlyMsg,
            onTimeMsg,
            lateMsg
        } = req.body;

        if (!name || !date || !time) {
            return res.status(400).json({ message: 'Name, date and time are required' });
        }

        const p = await Preset.create({
            name,
            date,
            time,
            duration: duration || 10,
            early: early || 5,
            late: late || 5,
            absent: absent || 45,
            earlyMsg,
            onTimeMsg,
            lateMsg,
            userId: req.user.id
        });

        res.status(201).json(p);
    } catch (err) {
        console.error('createPreset error:', err);
        res.status(500).json({ message: 'Failed to save preset' });
    }
}

module.exports = { listPresets, getPreset, createPreset };