// backend/config/config.js
require('dotenv').config();
module.exports = {
    development: {
        dialect: process.env.DB_DIALECT,
        storage: process.env.DB_STORAGE,
        url: process.env.DATABASE_URL,
    },
    production: {
        dialect: process.env.DB_DIALECT,
        url: process.env.DATABASE_URL,
        dialectOptions: { ssl: { rejectUnauthorized: false } }
    }
};