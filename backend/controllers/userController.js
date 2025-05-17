// backend/controllers/userController.js

const { User } = require('../models');
const bcrypt = require('bcrypt');
const { Sequelize, Op } = require('sequelize');

// ——————————————————————————————————————————————————————————————————
// CONFIG & HELPERS
// ——————————————————————————————————————————————————————————————————

const ALLOWED_CATEGORIES = ['admin', 'protocol', 'media', 'worship', 'ushering'];

/**
 * Returns true if this user may change their username now:
 * - 'developer' & 'admin': always true
 * - 'category-admin' & 'usher': only if ≥30 days since last change
 */
function canChangeUsername(user) {
    if (['category-admin', 'usher'].includes(user.role)) {
        const now = Date.now();
        const ago = new Date(user.usernameChangedAt).getTime();
        const daysSince = (now - ago) / (1000 * 60 * 60 * 24);
        return daysSince >= 30;
    }
    return true;
}

/** 
 * Extract a human-friendly error from a Sequelize UniqueConstraintError 
 */
function parseSequelizeError(err) {
    if (err instanceof Sequelize.UniqueConstraintError) {
        return err.errors.map(e => e.message).join('; ');
    }
    return null;
}

/** 2-digit year + 8-digit random */
function genUid() {
    const yy = new Date().getFullYear().toString().slice(-2);
    const rand = Math.floor(Math.random() * 1e8)
        .toString()
        .padStart(8, '0');
    return yy + rand;
}

/** Lowercase, no spaces */
function genUsername(name) {
    return name.replace(/\s+/g, '').toLowerCase();
}

/** Lowercase, no spaces, then @passFC */
function genPassword(source) {
    return source.replace(/\s+/g, '').toLowerCase() + '@passFC';
}

/** Valid username regex: only lowercase letters and digits */
const USERNAME_REGEX = /^[a-z0-9]+$/;

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
        if (!ALLOWED_CATEGORIES.includes(categoryType)) {
            return res.status(400).json({ message: 'Invalid category type' });
        }

        // Role-based creation permission
        if (actor === 'admin' && !['category-admin', 'usher'].includes(role)) {
            return res.status(403).json({ message: 'Admins can only create Heads or Members' });
        }
        if (actor === 'category-admin') {
            if (role !== 'usher' || categoryType !== req.user.categoryType) {
                return res.status(403).json({ message: 'Heads can only add Members in their own category' });
            }
        }

        // ────── USERNAME (optional) ──────
        if (!username || !username.trim()) {
            username = genUsername(name);
        } else {
            username = username.trim().toLowerCase();
        }

        // validate allowed characters
        if (!USERNAME_REGEX.test(username)) {
            return res.status(400).json({
                message: 'Username must contain only lowercase letters and numbers (no spaces or symbols).'
            });
        }

        // uniqueness check
        if (await User.findOne({ where: { username } })) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // ────── UID & PASSWORD ──────
        const uid = genUid();
        const passwordPlain = genPassword(username || name);
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
            usernameChangedAt: new Date()
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

        res.status(201).json({ user: safe, plainPassword: passwordPlain });
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
            username = username.trim().toLowerCase();

            // validate allowed characters
            if (!USERNAME_REGEX.test(username)) {
                return res.status(400).json({
                    message: 'Username must contain only lowercase letters and numbers (no spaces or symbols).'
                });
            }

            if (!canChangeUsername(user)) {
                return res.status(400).json({
                    message: 'Username can only be changed once every 30 days'
                });
            }
            if (await User.findOne({ where: { username } })) {
                return res.status(400).json({ message: 'Username already exists' });
            }

            updates.username = username;
            updates.usernameChangedAt = new Date();
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

exports.updateMyProfile = async function updateMyProfile(req, res, next) {
    try {
        const user = await User.findByPk(req.user.id);
        if (!user) return res.status(404).json({ message: 'Not found' });

        const { name, email, phone, gender, age, username } = req.body;
        const updates = { name, email, phone, gender, age };

        if (username && username !== user.username) {
            const uname = username.trim().toLowerCase();

            // validate allowed characters
            if (!USERNAME_REGEX.test(uname)) {
                return res.status(400).json({
                    message: 'Username must contain only lowercase letters and numbers (no spaces or symbols).'
                });
            }

            if (!canChangeUsername(user)) {
                return res.status(400).json({
                    message: 'Username can only be changed once every 30 days'
                });
            }
            if (await User.findOne({ where: { username: uname } })) {
                return res.status(400).json({ message: 'Username already exists' });
            }

            updates.username = uname;
            updates.usernameChangedAt = new Date();
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