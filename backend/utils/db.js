// backend/utils/db.js
const cfg = require('../config/config')[process.env.NODE_ENV || 'development'];
const opts = { logging: false };

if (cfg.dialect === 'sqlite') {
    opts.dialect = 'sqlite';
    opts.storage = cfg.storage;
    opts.dialectModule = require('@journeyapps/sqlcipher');
    opts.dialectOptions = {
        key: process.env.DB_ENCRYPTION_KEY,
        busyTimeout: 5000,
        foreignKeys: true,
    };
} else {
    // postgres
    opts.dialect = 'postgres';
    opts.url = cfg.url;
    opts.dialectOptions = { ssl: { rejectUnauthorized: false } };
}

const { Sequelize } = require('sequelize');
const sequelize = new Sequelize(opts.url || '', opts);

module.exports = { sequelize };