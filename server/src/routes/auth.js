import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  register,
  login,
  refresh,
  me,
  updateColor,
  updateProfile,
  changePassword,
  updateSharedModulesForMember,
  inviteToCircle,
  respondToInvite,
  removeFromCircle,
  listCircle,
} from '../controllers/authController.js';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', requireAuth, refresh);
router.get('/me', requireAuth, me);
router.put('/color', requireAuth, updateColor);
router.put('/profile', requireAuth, updateProfile);
router.put('/password', requireAuth, changePassword);

// Personnel management ("the circle")
router.get('/circle', requireAuth, listCircle);
router.post('/circle/invite', requireAuth, inviteToCircle);
router.post('/circle/respond', requireAuth, respondToInvite);
router.delete('/circle/:userId', requireAuth, removeFromCircle);
router.put('/circle/:userId/shared-modules', requireAuth, updateSharedModulesForMember);

export default router;