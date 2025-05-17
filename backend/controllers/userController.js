// backend/controllers/userController.js

const { User } = require('../models');
const bcrypt = require('bcrypt');
const { Sequelize, Op } = require('sequelize');

// ——————————————————————————————————————————————————————————————————
// CONFIG & HELPERS
// ——————————————————————————————————————————————————————————————————

const ALLOWED_CATEGORIES = ['admin', 'protocol', 'media', 'worship', 'ushering'];
const USERNAME_REGEX = /^[a-z0-9]+$/; // only lowercase letters & digits

function parseSequelizeError(err) {
    if (err instanceof Sequelize.UniqueConstraintError) {
        return err.errors.map(e => e.message).join('; ');
    }
    return null;
}

function genUid() {
    const yy = new Date().getFullYear().toString().slice(-2);
    const rand = Math.floor(Math.random() * 1e8)
        .toString()
        .padStart(8, '0');
    return yy + rand;
}

function genUsername(name) {
    return name.replace(/[\s.]+/g, '').toLowerCase();
}

function genPassword(source) {
    return source.replace(/[\s.]+/g, '').toLowerCase() + '@passFC';
}

/**
 * Returns whether a user may change username again:
 * - dev/admin: always
 * - category-admin/usher: max 3 times per 30-day window
 */
function canChangeUsername(user) {
    if (['category-admin', 'usher'].includes(user.role)) {
        const now = Date.now();
        const windowStart = new Date(user.usernameChangeWindowStart).getTime();
        const daysSinceWindow = (now - windowStart) / (1000 * 60 * 60 * 24);

        // if window expired, reset count
        if (daysSinceWindow >= 30) return true;

        // else check count < 3
        return user.usernameChangeCount < 3;
    }
    return true;
}

// update the count/window for a username change
function recordUsernameChange(user, updates) {
    const now = new Date();
    const windowStart = new Date(user.usernameChangeWindowStart).getTime();
    const daysSinceWindow = (now.getTime() - windowStart) / (1000 * 60 * 60 * 24);

    if (daysSinceWindow >= 30) {
        updates.usernameChangeWindowStart = now;
        updates.usernameChangeCount = 1;
    } else {
        updates.usernameChangeCount = user.usernameChangeCount + 1;
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
        if (!ALLOWED_CATEGORIES.includes(categoryType)) {
            return res.status(400).json({ message: 'Invalid category type' });
        }

        // Role‐based checks
        if (actor === 'admin' && !['category-admin', 'usher'].includes(role)) {
            return res.status(403).json({ message: 'Admins can only create Heads or Members' });
        }
        if (actor === 'category-admin') {
            if (role !== 'usher' || categoryType !== req.user.categoryType) {
                return res
                    .status(403)
                    .json({ message: 'Heads can only add Members in their own category' });
            }
        }

        // ────── USERNAME ──────
        if (!username || !username.trim()) {
            username = genUsername(name);
        } else {
            // strip spaces & dots, lowercase
            username = username.replace(/[\s.]+/g, '').toLowerCase();
        }

        if (!USERNAME_REGEX.test(username)) {
            return res
                .status(400)
                .json({ message: 'Username may only contain lowercase letters and digits.' });
        }
        if (await User.findOne({ where: { username } })) {
            return res.status(400).json({ message: 'Username already exists' });
        }

        // ────── UID & PASSWORD ──────
        const uid = genUid();
        const plainPwd = genPassword(username || name);
        const password = await bcrypt.hash(plainPwd, 10);

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
            password,
            usernameChangedAt: new Date(),
            // init our new tracking fields
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

        res.status(201).json({ user: safe, plainPassword: plainPwd });
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
                'usernameChangedAt',
                'usernameChangeCount',
                'usernameChangeWindowStart'
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
                'usernameChangedAt',
                'usernameChangeCount',
                'usernameChangeWindowStart'
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
                'usernameChangedAt',
                'usernameChangeCount',
                'usernameChangeWindowStart'
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

async function handleUsernameUpdate(user, newUsername, updates, res) {
    // strip spaces/dots + lowercase
    const clean = newUsername.replace(/[\s.]+/g, '').toLowerCase();

    if (clean === user.username) return; // no real change

    if (!USERNAME_REGEX.test(clean)) {
        return res
            .status(400)
            .json({ message: 'Username may only contain lowercase letters and digits.' });
    }

    if (!canChangeUsername(user)) {
        return res
            .status(400)
            .json({ message: 'You may change your username at most 3 times every 30 days.' });
    }

    if (await User.findOne({ where: { username: clean } })) {
        return res.status(400).json({ message: 'Username already exists.' });
    }

    // record the change
    recordUsernameChange(user, updates);
    updates.username = clean;
    updates.usernameChangedAt = new Date();
}

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

        if (username) {
            // if any error, handleUsernameUpdate will send response early
            const err = await handleUsernameUpdate(user, username, updates, res);
            if (err) return; // already responded
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

        let { name, email, phone, gender, age, username } = req.body;
        const updates = { name, email, phone, gender, age };

        if (username) {
            const err = await handleUsernameUpdate(user, username, updates, res);
            if (err) return;
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