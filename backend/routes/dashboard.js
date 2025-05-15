const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const { getStats } = require('../controllers/dashboardController');

router.get('/', authenticate, getStats);

module.exports = router;