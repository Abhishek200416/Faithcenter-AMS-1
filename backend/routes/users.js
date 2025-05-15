const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const {
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
    getMyProfile,
    updateMyProfile,
    countUsers
} = require('../controllers/userController');

// All routes require authentication
router.use(authenticate);

// — Count users —
// Admin/dev see all, category-admin limited by query
router.get(
    '/count',
    authorize(['developer', 'admin', 'category-admin']),
    countUsers
);

// — Create new user —
router.post(
    '/',
    authorize(['developer', 'admin', 'category-admin']),
    createUser
);

// — List all users —
router.get(
    '/',
    authorize(['developer', 'admin', 'category-admin']),
    getAllUsers
);

// — “Me” endpoints — (any authenticated user)
router.get('/me', getMyProfile);
router.put('/me', updateMyProfile);

// — Single‐user operations —
router.get(
    '/:id',
    authorize(['developer', 'admin', 'category-admin']),
    getUserById
);

router.put(
    '/:id',
    authorize(['developer', 'admin', 'category-admin']),
    updateUser
);

router.delete(
    '/:id',
    authorize(['developer', 'admin']),
    deleteUser
);

module.exports = router;