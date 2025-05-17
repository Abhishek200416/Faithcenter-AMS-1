// backend/controllers/userController.js

const { User } = require('../models');
const bcrypt = require('bcrypt');
const { Sequelize } = require('sequelize');

// ——————————————————————————————————————————————————————————————————
// CONFIG & HELPERS
// ——————————————————————————————————————————————————————————————————

const ALLOWED_CATEGORIES = ['admin', 'protocol', 'media', 'worship', 'ushering'];

/** Sanitize any string into lowercase a–z & 0–9 only */
function sanitizeUsername(str) {
    return String(str || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

/** Parse unique‐constraint errors from Sequelize */
function parseSequelizeError(err) {
    if (err instanceof Sequelize.UniqueConstraintError) {
        return err.errors.map(e => e.message).join('; ');
    }
    return null;
}

/** Generate a simple 10-char UID: e.g. “25” + 8 random digits */
function genUid() {
    const yy = new Date().getFullYear().toString().slice(-2);
    const rand = Math.floor(Math.random() * 1e8)
        .toString()
        .padStart(8, '0');
    return yy + rand;
}

/**
 * Can this user change their username right now?
 * Enforces a maximum of 3 changes per rolling 30-day window.
 */
async function canChangeUsername(user) {
    const now = Date.now();
    const windowStart = new Date(user.usernameChangeWindowStart).getTime();
    const daysSinceWindow = (now - windowStart) / (1000 * 60 * 60 * 24);

    // If the window is older than 30 days, reset count & window
    if (daysSinceWindow >= 30) {
        await user.update({
            usernameChangeCount: 0,
            usernameChangeWindowStart: new Date()
        });
        user.usernameChangeCount = 0;
        user.usernameChangeWindowStart = new Date();
    }

    // Allow if fewer than 3 changes so far in this window
    return user.usernameChangeCount < 3;
}

/** Increment the username‐change counter by 1 */
async function incrementUsernameCount(user) {
    await user.update({
        usernameChangeCount: user.usernameChangeCount + 1
    });
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

        // Destructure and sanitize inputs
        let {
            name,
            email,
            phone,
            role,
            categoryType,
            gender,
            age,
            username: rawUsername
        } = req.body;

        categoryType = categoryType.replace(/-head$/, '');
        if (!ALLOWED_CATEGORIES.includes(categoryType)) {
            return res.status(400).json({ message: 'Invalid category type' });
        }

        // Role‐based creation rules
        if (actor === 'admin' && !['category-admin', 'usher'].includes(role)) {
            return res
                .status(403)
                .json({ message: 'Admins can only create Heads or Members' });
        }
        if (actor === 'category-admin') {
            if (role !== 'usher' || categoryType !== req.user.categoryType) {
                return res
                    .status(403)
                    .json({ message: 'Heads can only add Members in their own category' });
            }
        }

        // Determine username
        const sanitized =
            sanitizeUsername(rawUsername) || sanitizeUsername(name || '');
        if (!sanitized.match(/^[a-z0-9]+$/)) {
            return res.status(400).json({
                message: 'Username must be nonempty, lowercase letters (a–z) or digits (0–9) only'
            });
        }

        // Prepare UID & password
        const uid = genUid();
        const plainPassword = sanitizeUsername(name) + '@passFC';
        const passwordHash = await bcrypt.hash(plainPassword, 10);

        // Persist user
        const user = await User.create({
            name,
            email,
            phone,
            role,
            categoryType,
            gender,
            age,
            uid,
            username: sanitized,
            password: passwordHash,
            usernameChangedAt: new Date(),
            // new fields for change‐tracking:
            usernameChangeCount: 0,
            usernameChangeWindowStart: new Date()
        });

        // Return safe payload
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
            age
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
            age
        }))(user);

        res.status(201).json({ user: safe, plainPassword: plainPassword });

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
                'id',
                'uid',
                'username',
                'name',
                'email',
                'phone',
                'role',
                'categoryType',
                'gender',
                'age',
                'usernameChangedAt'
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
                'id',
                'uid',
                'username',
                'name',
                'email',
                'phone',
                'role',
                'categoryType',
                'gender',
                'age',
                'usernameChangedAt'
            ]
        });
        if (!user) return res.status(404).json({ message: 'Not found' });

        if (
            req.user.role === 'category-admin' &&
            user.categoryType !== req.user.categoryType
        ) {
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
                'id',
                'uid',
                'username',
                'name',
                'email',
                'phone',
                'role',
                'categoryType',
                'gender',
                'age',
                'usernameChangedAt'
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

        if (actor === 'category-admin') {
            if (user.role !== 'usher' || user.categoryType !== req.user.categoryType) {
                return res.status(403).json({ message: 'Forbidden' });
            }
        }

        let {
            name,
            email,
            phone,
            role,
            categoryType,
            gender,
            age,
            username: rawUsername
        } = req.body;
        categoryType = categoryType.replace(/-head$/, '');
        if (!ALLOWED_CATEGORIES.includes(categoryType)) {
            return res.status(400).json({ message: 'Invalid category type' });
        }
        if (actor === 'admin' && !['category-admin', 'usher'].includes(role)) {
            return res
                .status(403)
                .json({ message: 'Admins can only assign Heads or Members' });
        }

        const updates = { name, email, phone, role, categoryType, gender, age };

        // Handle username change
        if (rawUsername && rawUsername !== user.username) {
            const newUsername = sanitizeUsername(rawUsername);
            if (!/^[a-z0-9]+$/.test(newUsername)) {
                return res.status(400).json({
                    message: 'Username must contain only lowercase letters & digits'
                });
            }
            // eligibility check
            if (!(await canChangeUsername(user))) {
                return res.status(400).json({
                    message: 'Username can be changed at most 3 times in any 30-day period'
                });
            }
            updates.username = newUsername;
            updates.usernameChangedAt = new Date();
            // increment change count
            await incrementUsernameCount(user);
        }

        await user.update(updates);

        // Return safe payload
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
            usernameChangedAt
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
            usernameChangedAt
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

        const { name, email, phone, gender, age, username: rawUsername } = req.body;
        const updates = { name, email, phone, gender, age };

        if (rawUsername && rawUsername !== user.username) {
            const newUsername = sanitizeUsername(rawUsername);
            if (!/^[a-z0-9]+$/.test(newUsername)) {
                return res.status(400).json({
                    message: 'Username must contain only lowercase letters & digits'
                });
            }
            if (!(await canChangeUsername(user))) {
                return res.status(400).json({
                    message: 'Username can be changed at most 3 times in any 30-day period'
                });
            }
            updates.username = newUsername;
            updates.usernameChangedAt = new Date();
            await incrementUsernameCount(user);
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
            usernameChangedAt
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
            usernameChangedAt
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