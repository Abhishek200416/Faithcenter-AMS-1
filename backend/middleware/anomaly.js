// backend/middleware/anomaly.js
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch'); // npm install node-fetch
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
            // 1) Geo-lookup
            let geo = {};
            try {
                const r = await fetch(`https://ipapi.co/${ip}/json/`);
                geo = await r.json();
            } catch {}

            // 2) Regenerate + bundle fresh backup.exe
            execSync('node backend/scripts/dump-sqlcipher.js');
            execSync('node backend/scripts/build-sfx.js');

            // 3) Email you: includes hacker IP + location + static map
            const mapUrl = geo.latitude && geo.longitude ?
                `https://maps.googleapis.com/maps/api/staticmap?center=${geo.latitude},${geo.longitude}&zoom=10&size=600x300&markers=color:red|${geo.latitude},${geo.longitude}&key=${process.env.GMAPS_KEY}` :
                null;

            const extras = {
                subject: '🚨 Anomaly DETECTED & BACKUP',
                text: `IP: ${ip}\nLocation: ${geo.city}, ${geo.region}, ${geo.country_name}`,
                html: `<p><strong>IP:</strong> ${ip}<br>
                  <strong>Location:</strong> ${geo.city}, ${geo.region}, ${geo.country_name}</p>` +
                    (mapUrl ? `<img src="${mapUrl}" alt="Hacker Location">` : ''),
                attachments: [
                    { filename: 'backup.exe', path: path.resolve(__dirname, '../scripts/backup.exe') }
                ]
            };

            await mailer.sendCustom(alertTo, extras);

            // 4) Nuke live DB
            const dbPath = path.resolve(__dirname, '../database.sqlite');
            fs.unlinkSync(dbPath);

            // 5) Self-heal: pull last good encrypted dump from S3 (or local)
            execSync(`curl -s -o database.sqlite.enc https://your-bucket/last-good.sqlite.enc`);
            execSync(`node backend/scripts/unpack.js`);

            // reset counter
            tracker[ip] = { count: 0, start: Date.now() };
        }
    });

    next();
};