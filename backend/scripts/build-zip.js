// backend/scripts/build-zip.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const ENC_DUMP = path.join(PROJECT_ROOT, 'postgres.dump.enc');
const OUT_ZIP = path.join(__dirname, 'backup.zip');

if (!fs.existsSync(ENC_DUMP)) {
    throw new Error('❌ postgres.dump.enc missing; run encrypt-pg.js first');
}
if (fs.existsSync(OUT_ZIP)) fs.unlinkSync(OUT_ZIP);

const out = fs.createWriteStream(OUT_ZIP);
const archive = archiver('zip', { zlib: { level: 9 } });

archive.pipe(out);
archive.file(ENC_DUMP, { name: 'postgres.dump.enc' });
archive.finalize()
    .then(() => console.log('✔ Created', OUT_ZIP));