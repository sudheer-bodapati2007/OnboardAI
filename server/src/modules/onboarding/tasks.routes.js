// src/modules/onboarding/tasks.routes.js
// Routes for individual task operations (status updates, employee task view)
import { Router } from 'express';
import * as OnboardingController from './onboarding.controller.js';
import { authenticate, requireHrAdmin } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { taskStatusSchema, startOnboardingSchema } from './onboarding.validation.js';

const router = Router();

router.use(authenticate);

// PATCH /api/v1/tasks/:id/status – both HR and employees (service enforces ownership)
router.patch(
  '/:id/status',
  validate(taskStatusSchema),
  OnboardingController.updateTaskStatus
);

export default router;

