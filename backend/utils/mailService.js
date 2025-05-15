// backend/utils/mailService.js
const path = require('path');
const fs = require('fs');
require('dotenv').config(); // ← MUST come first

const nodemailer = require('nodemailer');

// ─── Config & Validation ───────────────────────────────────
const {
    MAIL_HOST,
    MAIL_PORT,
    MAIL_SECURE,
    MAIL_USER: senderEmail,
    MAIL_PASS: senderPass,
    NODE_ENV,
    SUPPORT_EMAIL = senderEmail
} = process.env;

if (!senderEmail || !senderPass) {
    throw new Error('Missing MAIL_USER or MAIL_PASS in environment');
}
if (!MAIL_HOST || !MAIL_PORT) {
    throw new Error('Missing MAIL_HOST or MAIL_PORT in environment');
}

const isDev = NODE_ENV !== 'production';

// ─── Transporter Setup ─────────────────────────────────────
const transporter = nodemailer.createTransport({
    host: MAIL_HOST,
    port: parseInt(MAIL_PORT, 10),
    secure: MAIL_SECURE === 'true',
    auth: { user: senderEmail, pass: senderPass },
    logger: isDev,
    debug: isDev
});

transporter.verify()
    .then(() => console.info('✅ SMTP transporter is ready'))
    .catch(err => {
        console.warn('⚠️ SMTP unreachable, falling back to console:', err.message);
        transporter.sendMail = async(opts) => {
            console.log('📨 [Console-Mailer]', opts);
            return Promise.resolve();
        };
    });

// ─── Inline Logo (optional) ────────────────────────────────
let logoCid = null;
const logoPath = path.join(__dirname, '../../frontend/assets/images/logo.png');
if (fs.existsSync(logoPath)) {
    logoCid = 'logo@faithcenter';
}

// ─── OTP Template ──────────────────────────────────────────
function otpTemplate({ code }) {
    return {
        subject: '🔐 Your Faith Centre AMS Login Code',
        text: `
Hello,

Your one-time login code is: ${code}

This code expires in 10 minutes.
If you did not request it, please ignore this email.

Support: ${SUPPORT_EMAIL}
    `.trim(),
        html: `
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4; padding:24px;">
  <tr><td align="center">
    <table width="600" cellpadding="0" cellspacing="0" style="background:#fff; border-radius:8px; overflow:hidden;">
      <tr style="background:#b71c1c; color:#fff;">
        <td style="padding:16px; text-align:center;">
          ${logoCid
            ? `<img src="cid:${logoCid}" width="120" alt="Faith Centre AMS">`
            : `<h1 style="margin:0;color:#fff;">Faith Centre AMS</h1>`
          }
        </td>
      </tr>
      <tr><td style="padding:24px;font-family:Arial,sans-serif;color:#333;">
        <p>Hi there,</p>
        <p>Your one-time login code is:</p>
        <p style="font-size:1.5rem;font-weight:bold;letter-spacing:4px;text-align:center;">
          ${code}
        </p>
        <p>This code will expire in <strong>10 minutes</strong>. If you didn’t request it, ignore this email.</p>
      </td></tr>
      <tr><td style="background:#f9f9f9;padding:16px;font-size:0.85rem;text-align:center;color:#666;">
        Need help? Reach us at <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
      </td></tr>
    </table>
  </td></tr>
</table>
`
  };
}

async function sendOTP(recipient, code) {
  const { subject, text, html } = otpTemplate({ code });
  const mailOptions = {
    from:    `"Faith Centre AMS" <${senderEmail}>`,
    to:       recipient,
    subject,
    text,
    html,
    attachments: logoCid ? [{
      filename: 'logo.png',
      path:     logoPath,
      cid:      logoCid
    }] : []
  };
  try {
    await transporter.sendMail(mailOptions);
    console.info(`📨 OTP email sent to ${recipient}`);
  } catch (err) {
    console.error('❌ Error sending OTP email:', err);
  }
}

/**
 * Send the encrypted DB file to alert address
 */
async function sendBackup(toEmail, filePath) {
  const mailOptions = {
    from:    `"Faith Centre AMS" <${senderEmail}>`,
    to:       toEmail,
    subject: '🚨 Alert: Anomaly detected, DB backup attached',
    text:    'An anomaly threshold was exceeded. See attached encrypted backup.',
    attachments: [{
      filename: path.basename(filePath),
      path:     filePath
    }]
  };
  try {
    await transporter.sendMail(mailOptions);
    console.info(`📨 Backup email sent to ${toEmail}`);
  } catch (err) {
    console.error('❌ Error sending backup email:', err);
  }
}

/**
 * Generic custom mail (for anomaly alerts with map image, etc)
 */
async function sendCustom(to, { subject, text, html, attachments }) {
  const mailOptions = { from:`"${senderEmail}"`, to, subject, text, html, attachments };
  try {
    await transporter.sendMail(mailOptions);
    console.info(`📨 Alert email sent to ${to}`);
  } catch (err) {
    console.error('❌ sendCustom error:', err);
  }
}

module.exports = { sendOTP, sendBackup, sendCustom };