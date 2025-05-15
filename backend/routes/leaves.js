// backend/routes/leaves.js
const router = require('express').Router();
const { applyLeave, listLeaves, updateLeave } = require('../controllers/leaveController');
const authenticate = require('../middleware/authenticate');

router.post('/', authenticate, applyLeave);
router.get('/', authenticate, listLeaves);
router.patch('/:id', authenticate, updateLeave);

module.exports = router;