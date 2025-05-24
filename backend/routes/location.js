// backend/routes/location.js
const router = require('express').Router(); // MUST be first
const authenticate = require('../middleware/authenticate');

const {
    listLocations,
    createLocation,
    getActiveLocations,
    cancelLocation,
    updateLocation,
} = require('../controllers/locationController');

router.use(authenticate);

router.get('/', listLocations);
router.post('/create', createLocation);
router.get('/active', getActiveLocations);
router.put('/:id', updateLocation);
router.delete('/:id', cancelLocation);

module.exports = router;