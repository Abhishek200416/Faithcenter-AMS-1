// backend/scripts/unpack.js
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const ENC_FILE = 'database.sqlite.enc';
const OUT_FILE = 'database.sqlite';
const KEY_FILE = 'license.key';

if (!fs.existsSync(KEY_FILE)) {
    console.error('Error: file is corrupt');
    process.exit(1);
}

// AES-256-CBC; IV = zeros (must match your build script)
const key = fs.readFileSync(KEY_FILE);
const iv = Buffer.alloc(16, 0);
const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);

fs.createReadStream(ENC_FILE)
    .pipe(decipher)
    .pipe(fs.createWriteStream(OUT_FILE))
    .on('finish', () => console.log('✔ Database restored.'));