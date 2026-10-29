// src/modules/policy/policy.routes.js
import { Router } from 'express';
import * as PolicyController from './policy.controller.js';
import { authenticate, requireHrAdmin } from '../../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many uploads' } },
});

const router = Router();
router.use(authenticate, requireHrAdmin);

// GET    /api/v1/policies
router.get('/', PolicyController.listPolicies);

// POST   /api/v1/policies  (multipart/form-data, field: file)
router.post('/', uploadLimiter, PolicyController.uploadPolicy);

// DELETE /api/v1/policies/:id
router.delete('/:id', PolicyController.deletePolicy);

export default router;

