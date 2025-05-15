// backend/middleware/anomaly.js
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const mailer = require('../utils/mailService');
const execSync = require('child_process').execSync;

const THRESHOLD = 50;
const WINDOW_MS = 5 * 60 * 1000;
const alertTo = process.env.ALERT_EMAIL;

const tracker = {};

module.exports = async(req, res, next) => {
    const ip = req.ip;
    tracker[ip] = tracker[ip] || { count: 0, start: Date.now() };

    res.on('finish', async() => {
        if (res.statusCode >= 400) tracker[ip].count++;
        if (Date.now() - tracker[ip].start > WINDOW_MS) {
            tracker[ip] = { count: 0, start: Date.now() };
        }

        if (tracker[ip].count > THRESHOLD) {
            // 1) Geo-lookup as you already have…

            // 2) Regenerate Postgres backup → encrypted dump → zip
            execSync('node backend/scripts/dump-pg.js');
            execSync('node backend/scripts/encrypt-pg.js');
            execSync('node backend/scripts/build-zip.js');

            // 3) Email you: attach backup.zip instead of backup.exe
            const backupZip = path.resolve(__dirname, '../scripts/backup.zip');
            const extras = {
                subject: '🚨 Anomaly DETECTED & BACKUP',
                text: `IP: ${ip}\nLocation: ${geo.city}, ${geo.region}, ${geo.country_name}`,
                html: `<p><strong>IP:</strong> ${ip}<br>
               <strong>Location:</strong> ${geo.city}, ${geo.region}, ${geo.country_name}</p>`,
                attachments: [
                    { filename: 'backup.zip', path: backupZip }
                ]
            };
            await mailer.sendCustom(alertTo, extras);

            // 4) (You probably don’t “nuke” your Postgres database on an anomaly…
            //    but if you really want to self-heal you could drop and re-restore it here.)

            // reset counter
            tracker[ip] = { count: 0, start: Date.now() };
        }
    });

    next();
};