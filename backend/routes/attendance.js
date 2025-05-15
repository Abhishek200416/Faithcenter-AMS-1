const router = require('express').Router();
const { punch, getHistory } = require('../controllers/attendanceController');

router.post('/punch', punch);
router.get('/history', getHistory);

module.exports = router;