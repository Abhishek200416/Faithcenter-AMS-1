const crypto = require('crypto');
module.exports.generateToken = () =>
    crypto.randomBytes(16).toString('hex');