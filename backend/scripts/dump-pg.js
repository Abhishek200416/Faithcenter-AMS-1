// backend/scripts/dump-pg.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { execSync } = require('child_process');
const path = require('path');

const DUMP_FILE = path.resolve(__dirname, '../postgres.dump');
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('❌ Missing DATABASE_URL');
    process.exit(1);
}

console.log('→ Creating PostgreSQL dump...');
// now only dump the "users" table:
execSync(`pg_dump "${DATABASE_URL}" -Fc -f "${DUMP_FILE}" -t public.users`);

console.log('✔ Dump created at', DUMP_FILE);