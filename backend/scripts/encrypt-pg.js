// backend/scripts/encrypt-pg.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const KEY = Buffer.from(process.env.BACKUP_ENCRYPTION_KEY, 'hex');
const IV_LENGTH = 16;
const SRC = path.resolve(__dirname, '../postgres.dump');
const OUT = path.resolve(__dirname, '../postgres.dump.enc');

if (!fs.existsSync(SRC)) {
    console.error('❌ postgres.dump not found, run dump-pg.js first');
    process.exit(1);
}

const iv = crypto.randomBytes(IV_LENGTH);
const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
const inp = fs.createReadStream(SRC);
const out = fs.createWriteStream(OUT);

// prefix the IV so we can grab it on decrypt
out.write(iv);
inp.pipe(cipher).pipe(out)
    .on('finish', () => console.log('✔ Encrypted dump →', OUT));