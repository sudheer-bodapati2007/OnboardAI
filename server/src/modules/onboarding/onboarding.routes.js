// src/modules/onboarding/onboarding.routes.js
import { Router } from 'express';
import * as OnboardingController from './onboarding.controller.js';
import { authenticate, requireHrAdmin } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createTemplateSchema,
  updateTemplateSchema,
  startOnboardingSchema,
  taskStatusSchema,
} from './onboarding.validation.js';

const router = Router();

router.use(authenticate);

// ─── Templates (HR admin only) ────────────────────────────────────────────────
router.get('/templates', requireHrAdmin, OnboardingController.listTemplates);
router.post(
  '/templates',
  requireHrAdmin,
  validate(createTemplateSchema),
  OnboardingController.createTemplate
);
router.patch(
  '/templates/:id',
  requireHrAdmin,
  validate(updateTemplateSchema),
  OnboardingController.updateTemplate
);

// ─── Employee-facing ──────────────────────────────────────────────────────────
// Employee views their own tasks
router.get('/me', OnboardingController.getMyTasks);

// ─── Overview (HR admin) ──────────────────────────────────────────────────────
router.get('/overview', requireHrAdmin, OnboardingController.getOverview);

export default router;

