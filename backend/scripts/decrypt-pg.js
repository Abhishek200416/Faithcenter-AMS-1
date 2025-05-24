// backend/scripts/decrypt-pg.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'hex');
const IV_LENGTH = 16;
const ENC_FILE = path.resolve(__dirname, './postgres.dump.enc');

const OUT_DUMP = path.resolve(__dirname, '../postgres.dump');

if (!fs.existsSync(ENC_FILE)) {
    console.error('❌ postgres.dump.enc not found');
    process.exit(1);
}

const inp = fs.createReadStream(ENC_FILE);

// first read the IV off the front
let iv = Buffer.alloc(0);
inp.once('readable', () => {
    iv = inp.read(IV_LENGTH);
    const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
    inp.pipe(decipher)
        .pipe(fs.createWriteStream(OUT_DUMP))
        .on('finish', () => console.log('✔ Decrypted →', OUT_DUMP));
});