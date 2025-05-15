// backend/routes/backup.js
const router     = require('express').Router();
const path       = require('path');
const fs         = require('fs');
const { execSync } = require('child_process');
const fileUpload = require('express-fileupload');

const authenticate = require('../middleware/authenticate');
const authorize    = require('../middleware/authorize');

router.use(authenticate);
router.use(authorize(['developer']));
router.use(fileUpload({ limits:{ fileSize:100*1024*1024 }}));

const SCRIPTS   = path.resolve(__dirname,'../scripts');
const DUMP_PG   = path.join(SCRIPTS,'dump-pg.js');
const ENC_PG    = path.join(SCRIPTS,'encrypt-pg.js');
const BUILD_ZIP = path.join(SCRIPTS,'build-zip.js');
const DECRYPT   = path.join(SCRIPTS,'decrypt-pg.js');

const DUMP_FILE = path.resolve(__dirname,'../postgres.dump');
const ENC_FILE  = path.resolve(__dirname,'../postgres.dump.enc');
const ZIP_FILE  = path.join(SCRIPTS,'backup.zip');

/** GET /api/backup/download **/
router.get('/download', (req,res,next) => {
  try {
    execSync(`node "${DUMP_PG}"`);     // create postgres.dump
    execSync(`node "${ENC_PG}"`);      // encrypt → postgres.dump.enc
    execSync(`node "${BUILD_ZIP}"`);   // zip the .enc
    res
      .type('application/zip')
      .set('Content-Disposition','attachment; filename="backup.zip"')
      .sendFile(ZIP_FILE, err => err && next(err));
  } catch(err) {
    next(err);
  }
});

/** POST /api/backup/upload **/
router.post('/upload', async(req,res,next) => {
  try {
    if (!req.files?.backup) {
      return res.status(400)
        .json({ message:'Upload the encrypted dump (.enc) or a .zip as field "backup"' });
    }

    const up = req.files.backup;
    const magic = up.data.slice(0,4);

    // raw .enc?
    if (magic.toString('hex',0,2)==='001f8b') {
      // it's gzip? unlikely
    }
    // PKZIP?
    if (magic[0]===0x50 && magic[1]===0x4b) {
      const TMP = path.join(SCRIPTS,'upl.zip');
      await up.mv(TMP);
      await fs.createReadStream(TMP)
              .pipe(require('unzipper').Extract({ path:SCRIPTS }))
              .promise();
    } else {
      // assume raw postgres.dump.enc
      await fs.promises.writeFile(ENC_FILE, up.data);
    }

    // decrypt → postgres.dump
    execSync(`node "${DECRYPT}"`,{ cwd:SCRIPTS });
    // restore
    const DATABASE_URL = process.env.DATABASE_URL;
    execSync(`pg_restore --clean --no-owner --dbname="${DATABASE_URL}" "${DUMP_FILE}"`);

    res.json({ message:'Database restored successfully.' });
  } catch(err) {
    next(err);
  }
});

module.exports = router;
