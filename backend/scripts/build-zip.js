// backend/scripts/build-zip.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// PROJECT_ROOT is two levels up from this script
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

// the encrypted dump lives at the project root
const ENC_DB = path.join(PROJECT_ROOT, 'database.sqlite.enc');
// fallback to the plaintext DB at the project root
const PLAIN_DB = path.join(PROJECT_ROOT, 'database.sqlite');
// optional license key (still in scripts/)
const LIC_KEY = path.join(__dirname, 'license.key');
// output ZIP sits next to this script
const OUT_ZIP = path.join(__dirname, 'backup.zip');

// delete any old ZIP
if (fs.existsSync(OUT_ZIP)) fs.unlinkSync(OUT_ZIP);

// create the archive
const output = fs.createWriteStream(OUT_ZIP);
const archive = archiver('zip', { zlib: { level: 9 } });

archive.pipe(output);
archive.on('error', err => { throw err; });

// include encrypted if present
if (fs.existsSync(ENC_DB)) {
    console.log('→ including encrypted dump');
    archive.file(ENC_DB, { name: 'database.sqlite.enc' });
}
// else include plaintext
else if (fs.existsSync(PLAIN_DB)) {
    console.warn('⚠️  encrypted dump not found; including plain database.sqlite');
    archive.file(PLAIN_DB, { name: 'database.sqlite' });
} else {
    throw new Error('No database file found to zip (neither .enc nor plain .sqlite)');
}

// optionally bundle your license key
if (fs.existsSync(LIC_KEY)) {
    archive.file(LIC_KEY, { name: 'license.key' });
}

archive.finalize()
    .then(() => console.log(`✔ Created ${OUT_ZIP} (${archive.pointer()} bytes)`));