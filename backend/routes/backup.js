// backend/routes/backup.js
const router = require('express').Router();
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const fileUpload = require('express-fileupload');

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');

router.use(authenticate);
router.use(authorize(['developer']));
router.use(fileUpload({ limits: { fileSize: 50 * 1024 * 1024 } }));

const DUMP_JS = path.join(__dirname, '../scripts/dump-sqlcipher.js');
const BUILD_ZIP = path.join(__dirname, '../scripts/build-zip.js');
const ZIP_PATH = path.join(__dirname, '../scripts/backup.zip');
const UNPACK_JS = path.join(__dirname, '../scripts/unpack.js');
const PLAIN_DEST = path.resolve(__dirname, '../..', 'database.sqlite');

router.get('/download', (req, res, next) => {
    try {
        execSync(`node "${DUMP_JS}"`);
        execSync(`node "${BUILD_ZIP}"`);
        res
            .type('application/zip')
            .set('Content-Disposition', 'attachment; filename="backup.zip"')
            .sendFile(ZIP_PATH, err => err && next(err));
    } catch (err) {
        next(err);
    }
});

router.post('/upload', async(req, res, next) => {
    try {
        if (!req.files || !req.files.backup) {
            return res
                .status(400)
                .json({ message: 'Please upload the backup (zip or sqlite) as form-field "backup".' });
        }

        const uploaded = req.files.backup;
        const magic = uploaded.data.slice(0, 4);

        // 1) Raw sqlite file?
        if (magic.toString() === 'SQLi') {
            // overwrite live DB
            await fs.promises.writeFile(PLAIN_DEST, uploaded.data);
            return res.json({ message: 'Plaintext database.sqlite restored.' });
        }

        // 2) PKZIP?
        if (magic[0] === 0x50 && magic[1] === 0x4b) {
            // save zip, unzip into scripts/
            const UP = path.join(__dirname, '../scripts/uploaded.zip');
            const dest = path.join(__dirname, '../scripts');
            await uploaded.mv(UP);

            const unzipper = require('unzipper');
            await fs.createReadStream(UP)
                .pipe(unzipper.Extract({ path: dest }))
                .promise();

            // decrypt if we have an encrypted dump + key, else move plain
            const enc = path.join(dest, 'database.sqlite.enc');
            const key = path.join(dest, 'license.key');
            const plain = path.join(dest, 'database.sqlite');

            if (fs.existsSync(enc) && fs.existsSync(key)) {
                execSync(`node "${UNPACK_JS}"`, { cwd: dest });
            } else if (fs.existsSync(plain)) {
                // copy right back
                fs.copyFileSync(plain, PLAIN_DEST);
            } else {
                throw new Error('ZIP did not contain database.sqlite(.enc) or license.key');
            }

            return res.json({ message: 'Backup restored successfully.' });
        }

        throw new Error('Unrecognized file format (not sqlite or zip)');
    } catch (err) {
        next(err);
    }
});

module.exports = router;