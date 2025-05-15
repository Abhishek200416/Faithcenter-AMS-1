// 🔧 FIXED: backend/scripts/dump-sqlcipher.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { execSync } = require('child_process');
const path = require('path');

const SRC_DB = path.resolve(__dirname, '../database.sqlite'); // actual database
const ENC_DB = path.resolve(__dirname, '../database.sqlite.enc'); // encrypted dump

const KEY = process.env.DB_ENCRYPTION_KEY;

if (!KEY) {
    console.error('❌ Missing DB_ENCRYPTION_KEY');
    process.exit(1);
}

// Rekey the live DB into an encrypted file
execSync(`
  sqlcipher ${SRC_DB} <<SQL
    PRAGMA key = '${KEY}';
    ATTACH DATABASE '${ENC_DB}' AS encrypted KEY '${KEY}';
    SELECT sqlcipher_export('encrypted');
    DETACH DATABASE encrypted;
  SQL
`);
console.log('✔ Created encrypted dump:', ENC_DB);