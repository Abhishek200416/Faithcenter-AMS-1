const router = require('express').Router();
const { createQR, getActiveQR } = require('../controllers/qrController');
const authenticate = require('../middleware/authenticate');

router.post('/generate', authenticate, createQR);
router.get('/active', authenticate, getActiveQR);

module.exports = router;