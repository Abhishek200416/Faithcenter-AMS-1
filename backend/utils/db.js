// backend/utils/db.js
require('dotenv').config();
const { Sequelize } = require('sequelize');
const sqlite3 = require('@journeyapps/sqlcipher');
const config = require('../config/config');

if (!process.env.DB_ENCRYPTION_KEY) {
    console.error('❌ Missing DB_ENCRYPTION_KEY');
    process.exit(1);
}

const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: config.storage,
    dialectModule: sqlite3,
    dialectOptions: {
        key: process.env.DB_ENCRYPTION_KEY,
        busyTimeout: 5000,
        foreignKeys: true,
    },
    logging: false
});

module.exports = { sequelize };