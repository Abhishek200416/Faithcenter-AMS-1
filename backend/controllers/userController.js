// backend/controllers/userController.js

const { User } = require('../models');
const bcrypt = require('bcrypt');
const { Sequelize, Op } = require('sequelize');

// ——————————————————————————————————————————————————————————————————
// CONFIG & HELPERS
// ——————————————————————————————————————————————————————————————————

const ALLOWED_CATEGORIES = ['admin', 'protocol', 'media', 'worship', 'ushering'];
const MAX_CHANGES = 3;
const WINDOW_DAYS = 30;
const USERNAME_REGEX = /^[a-z0-9]+$/; // only lowercase letters & digits

/**
 * Parse a Sequelize unique‐constraint error into a friendly message
 */
function parseSequelizeError(err) {
    if (err instanceof Sequelize.UniqueConstraintError) {
        return err.errors.map(e => e.message).join('; ');
    }
    return null;
}

/** 2-digit year + 8-digit random UID */
function genUid() {
    const yy = new Date().getFullYear().toString().slice(-2);
    const rand = Math.floor(Math.random() * 1e8).toString().padStart(8, '0');
    return yy + rand;
}

/** Lowercase, strip spaces & dots */
function cleanUsername(raw) {
    return raw.toLowerCase().replace(/[\s\.]+/g, '');
}

/** Default username from name */
function genUsername(name) {
    return cleanUsername(name);
}

/** Default password from username */
function genPassword(source) {
    return cleanUsername(source) + '@passFC';
}

/**
 * Checks if user may change username:
 * - dev/admin always allowed
 * - others: max MAX_CHANGES per WINDOW_DAYS rolling window
 */
async function canChangeUsername(user) {
    const now = Date.now();
    const ws = user.usernameChangeWindowStart ?
        new Date(user.usernameChangeWindowStart).getTime() :
        now;
    const elapsedDays = (now - ws) / (1000 * 60 * 60 * 24);
    let count = user.usernameChangeCount || 0;
    let windowStart = new Date(ws);

    if (elapsedDays >= WINDOW_DAYS) {
        count = 0;
        windowStart = new Date();
    }

    if (user.role === 'developer' || user.role === 'admin' || count < MAX_CHANGES) {
        return { allowed: true, count, windowStart };
    } else {
        const daysLeft = Math.ceil(WINDOW_DAYS - elapsedDays);
        return { allowed: false, daysLeft };
    }
}

// ——————————————————————————————————————————————————————————————————
// CREATE
// ——————————————————————————————————————————————————————————————————

exports.createUser = async function createUser(req, res, next) {
    try {
        const actor = req.user.role;
        if (!['developer', 'admin', 'category-admin'].includes(actor)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        let { name, email, phone, role, categoryType, gender, age, username } = req.body;
        categoryType = categoryType.replace(/-head$/, '');

        // category & role validation
        if (!ALLOWED_CATEGORIES.includes(categoryType)) {
            return res.status(400).json({ message: 'Invalid category type' });
        }
        if (actor === 'admin' && !['category-admin', 'usher'].includes(role)) {
            return res.status(403).json({ message: 'Admins can only create Heads or Members' });
        }
        if (actor === 'category-admin' && (role !== 'usher' || categoryType !== req.user.categoryType)) {
            return res.status(403).json({ message: 'Heads can only add Members in their own category' });
        }

        // ────── USERNAME ──────
        if (!username || !username.trim()) {
            username = genUsername(name);
        } else {
            username = cleanUsername(username);
        }
        if (!USERNAME_REGEX.test(username)) {
            return res.status(400).json({
                message: 'Username must use only lowercase letters and digits (no spaces, dots or symbols).'
            });
        }
        if (await User.findOne({ where: { username } })) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // ────── UID & PASSWORD ──────
        const uid = genUid();
        const passwordPlain = genPassword(username);
        const passwordHash = await bcrypt.hash(passwordPlain, 10);

        // ────── CREATE ──────
        const user = await User.create({
            name,
            email,
            phone,
            role,
            categoryType,
            gender,
            age,
            uid,
            username,
            password: passwordHash,
            usernameChangedAt: new Date(),
            usernameChangeCount: 0,
            usernameChangeWindowStart: new Date()
        });

        const safe = (({ id, uid, username, name, email, phone, role, categoryType, gender, age }) => ({
            id,
            uid,
            username,
            name,
            email,
            phone,
            role,
            categoryType,
            gender,
            age
        }))(user);

        return res.status(201).json({ user: safe, plainPassword });
    } catch (err) {
        const msg = parseSequelizeError(err);
        if (msg) return res.status(400).json({ message: msg });
        next(err);
    }
};

// ——————————————————————————————————————————————————————————————————
// READ
// ——————————————————————————————————————————————————————————————————

exports.getAllUsers = async function getAllUsers(req, res, next) {
    try {
        const where = {};
        if (req.user.role === 'category-admin') {
            where.categoryType = req.user.categoryType;
        }
        const users = await User.findAll({
            where,
            attributes: [
                'id', 'uid', 'username', 'name', 'email', 'phone',
                'role', 'categoryType', 'gender', 'age', 'usernameChangedAt',
                'usernameChangeCount', 'usernameChangeWindowStart'
            ]
        });
        res.json({ users });
    } catch (err) {
        next(err);
    }
};

exports.getUserById = async function getUserById(req, res, next) {
    try {
        const user = await User.findByPk(req.params.id, {
            attributes: [
                'id', 'uid', 'username', 'name', 'email', 'phone',
                'role', 'categoryType', 'gender', 'age', 'usernameChangedAt',
                'usernameChangeCount', 'usernameChangeWindowStart'
            ]
        });
        if (!user) return res.status(404).json({ message: 'Not found' });
        if (req.user.role === 'category-admin' && user.categoryType !== req.user.categoryType) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        res.json({ user });
    } catch (err) {
        next(err);
    }
};

exports.getMyProfile = async function getMyProfile(req, res, next) {
    try {
        const user = await User.findByPk(req.user.id, {
            attributes: [
                'id', 'uid', 'username', 'name', 'email', 'phone',
                'role', 'categoryType', 'gender', 'age', 'usernameChangedAt',
                'usernameChangeCount', 'usernameChangeWindowStart'
            ]
        });
        res.json({ user });
    } catch (err) {
        next(err);
    }
};

// ——————————————————————————————————————————————————————————————————
// UPDATE
// ——————————————————————————————————————————————————————————————————

exports.updateUser = async function updateUser(req, res, next) {
    try {
        const actor = req.user.role;
        if (!['developer', 'admin', 'category-admin'].includes(actor)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: 'Not found' });
        if (actor === 'category-admin' && (user.role !== 'usher' || user.categoryType !== req.user.categoryType)) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        let { name, email, phone, role, categoryType, gender, age, username } = req.body;
        categoryType = categoryType.replace(/-head$/, '');

        if (!ALLOWED_CATEGORIES.includes(categoryType)) {
            return res.status(400).json({ message: 'Invalid category type' });
        }
        if (actor === 'admin' && !['category-admin', 'usher'].includes(role)) {
            return res.status(403).json({ message: 'Admins can only assign Heads or Members' });
        }

        const updates = { name, email, phone, role, categoryType, gender, age };

        // ────── USERNAME CHANGE ──────
        if (username && username !== user.username) {
            const cleaned = cleanUsername(username);
            if (!USERNAME_REGEX.test(cleaned)) {
                return res.status(400).json({
                    message: 'Username must use only lowercase letters and digits (no spaces, dots or symbols).'
                });
            }

            const { allowed, daysLeft, startDate } = await canChangeUsername(user);
            if (!allowed) {
                return res.status(400).json({
                    message: `You’ve used ${MAX_CHANGES} changes this 30-day window; try again in ${daysLeft} days.`
                });
            }
            if (await User.findOne({ where: { username: cleaned } })) {
                return res.status(400).json({ message: 'Username already exists' });
            }

            const now = new Date();
            // reset or increment count
            if ((now - startDate) / (1000 * 60 * 60 * 24) >= WINDOW_DAYS) {
                updates.usernameChangeCount = 1;
                updates.usernameChangeWindowStart = now;
            } else {
                updates.usernameChangeCount = (user.usernameChangeCount || 0) + 1;
            }

            updates.username = cleaned;
            updates.usernameChangedAt = now;
        }

        await user.update(updates);

        const safe = (({
            id,
            uid,
            username,
            name,
            email,
            phone,
            role,
            categoryType,
            gender,
            age,
            usernameChangedAt,
            usernameChangeCount,
            usernameChangeWindowStart
        }) => ({
            id,
            uid,
            username,
            name,
            email,
            phone,
            role,
            categoryType,
            gender,
            age,
            usernameChangedAt,
            usernameChangeCount,
            usernameChangeWindowStart
        }))(user);

        res.json({ user: safe });
    } catch (err) {
        const msg = parseSequelizeError(err);
        if (msg) return res.status(400).json({ message: msg });
        next(err);
    }
};

exports.updateMyProfile = async function updateMyProfile(req, res, next) {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ message: 'Not found' });

        const { name, email, phone, gender, age, username } = req.body;
        const updates = { name, email, phone, gender, age };

        if (username && username !== user.username) {
            const cleaned = cleanUsername(username);
            if (!USERNAME_REGEX.test(cleaned)) {
                return res.status(400).json({
                    message: 'Username must use only lowercase letters and digits (no spaces, dots or symbols).'
                });
            }

            const { allowed, daysLeft, startDate } = await canChangeUsername(user);
            if (!allowed) {
                return res.status(400).json({
                    message: `You’ve used ${MAX_CHANGES} changes this 30-day window; try again in ${daysLeft} days.`
                });
            }
            if (await User.findOne({ where: { username: cleaned } })) {
                return res.status(400).json({ message: 'Username already exists' });
            }

            const now = new Date();
            if ((now - startDate) / (1000 * 60 * 60 * 24) >= WINDOW_DAYS) {
                updates.usernameChangeCount = 1;
                updates.usernameChangeWindowStart = now;
            } else {
                updates.usernameChangeCount = (user.usernameChangeCount || 0) + 1;
            }

            updates.username = cleaned;
            updates.usernameChangedAt = now;
        }

        await user.update(updates);

        const safe = (({
            id,
            uid,
            username,
            name,
            email,
            phone,
            role,
            categoryType,
            gender,
            age,
            usernameChangedAt,
            usernameChangeCount,
            usernameChangeWindowStart
        }) => ({
            id,
            uid,
            username,
            name,
            email,
            phone,
            role,
            categoryType,
            gender,
            age,
            usernameChangedAt,
            usernameChangeCount,
            usernameChangeWindowStart
        }))(user);

        res.json({ user: safe });
    } catch (err) {
        const msg = parseSequelizeError(err);
        if (msg) return res.status(400).json({ message: msg });
        next(err);
    }
};

// ——————————————————————————————————————————————————————————————————
// DELETE & COUNT
// ——————————————————————————————————————————————————————————————————

exports.deleteUser = async function deleteUser(req, res, next) {
    try {
        const actor = req.user.role;
        if (!['developer', 'admin'].includes(actor)) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        const user = await User.findByPk(req.params.id);
        if (!user) return res.status(404).json({ message: 'Not found' });
        await user.destroy();
        res.status(204).end();
    } catch (err) {
        next(err);
    }
};

exports.countUsers = async function countUsers(req, res, next) {
    try {
        const where = {};
        if (req.query.category) {
            where.categoryType = req.query.category;
        }
        const count = await User.count({ where });
        res.json({ count });
    } catch (err) {
        next(err);
    }
};