// backend/utils/db.js
const { Sequelize } = require('sequelize');
const cfg = require('../config/config')[process.env.NODE_ENV || 'development'];

const sequelize = new Sequelize(cfg.url, {
    dialect: cfg.dialect,
    dialectOptions: { ssl: { rejectUnauthorized: false } },
    logging: false,
});

module.exports = { sequelize };