// backend/routes/attendance.js

const router = require('express').Router();
const {
    ensureDeveloper,
    punch,
    getHistory,
    addRecord,
    updateRecord,
    deleteRecord
} = require('../controllers/attendanceController');

//  punching stays open to all authenticated users:
router.post('/punch', punch);
router.get('/history', getHistory);

// Developer-only manual management:
router.post('/manage/add', ensureDeveloper, addRecord);
router.put('/manage/:id', updateRecord);
router.delete('/manage/:id', ensureDeveloper, deleteRecord);

module.exports = router;