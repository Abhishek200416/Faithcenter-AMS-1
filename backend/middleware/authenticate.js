    // backend/middleware/authenticate.js
    const jwt = require('jsonwebtoken');
    const { User } = require('../models');

    module.exports = async (req, res, next) => {
        try {
            const token = req.headers.authorization?.split(' ')[1];
            if (!token) return res.status(401).json({ message: 'Missing token' });

            const payload = jwt.verify(token, process.env.JWT_SECRET, {
                algorithms: ['HS256'],
                // enforce max age (e.g. 1d)
                maxAge: '1d'
            });

            const user = await User.findByPk(payload.sub);
            if (!user) throw new Error();

            // Attach user + request info
            req.user = {
                id: user.id,
                role: user.role,
                categoryType: user.categoryType,
                ip: req.ip
            };

            next();
        } catch (err) {
            console.warn('Auth failed:', err.message);
            res.status(401).json({ message: 'Invalid or expired token' });
        }
    };
