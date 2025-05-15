// backend/routes/preset.js
const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const {
    listPresets,
    getPreset,
    createPreset
} = require('../controllers/presetController');

router.use(authenticate);

router.get('/', listPresets);
router.get('/:id', getPreset);
router.post('/', createPreset);

module.exports = router;