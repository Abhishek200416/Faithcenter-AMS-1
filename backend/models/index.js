const fs = require('fs');
const path = require('path');
const { sequelize } = require('../utils/db');
const db = {};

fs.readdirSync(__dirname)
    .filter(f => f.endsWith('.js') && f !== 'index.js')
    .forEach(f => {
        const filePath = path.join(__dirname, f);
        const modelImport = require(filePath);
        // support both `module.exports = fn` and `exports.default = fn`
        const defineModel = typeof modelImport === 'function' ?
            modelImport :
            modelImport.default;

        if (typeof defineModel !== 'function') {
            console.warn(`⚠️  Skipping ${f}: does not export a function`);
            return;
        }

        const model = defineModel(sequelize);
        db[model.name] = model;
    });

// set up associations
Object.values(db)
    .forEach(model => {
        if (typeof model.associate === 'function') {
            model.associate(db);
        }
    });

db.sequelize = sequelize;
db.Sequelize = require('sequelize');
module.exports = db;