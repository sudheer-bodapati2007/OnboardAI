// src/modules/ai/ai.routes.js
import { Router } from 'express';
import { chat } from './ai.controller.js';
import { authenticate } from '../../middleware/auth.js';
import rateLimit from 'express-rate-limit';

const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: { code: 'RATE_LIMIT', message: 'AI query limit reached. Try again in an hour.' },
  },
});

const router = Router();

// All authenticated users (HR + employees) can use AI chat
router.use(authenticate);
router.post('/chat', aiLimiter, chat);

export default router;

