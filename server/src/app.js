// src/app.js
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import { env } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';

// Route modules
import authRoutes from './modules/auth/auth.routes.js';
import employeeRoutes from './modules/employees/employees.routes.js';
import onboardingRoutes from './modules/onboarding/onboarding.routes.js';
import taskRoutes from './modules/onboarding/tasks.routes.js';

// Employee-task sub-routes (mounted under employees router)
import { authenticate, requireHrAdmin } from './middleware/auth.js';
import * as OnboardingController from './modules/onboarding/onboarding.controller.js';
import { validate } from './middleware/validate.js';
import { startOnboardingSchema } from './modules/onboarding/onboarding.validation.js';

const app = express();

// ─── Security headers ─────────────────────────────────────────────────────────
app.use(
  helmet({
    crossOriginEmbedderPolicy: false,
    contentSecurityPolicy: false,
  })
);

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(
  cors({
    origin: env.clientUrl,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ─── Rate limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many requests' } },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMIT', message: 'Too many auth requests' } },
});

app.use('/api/', apiLimiter);

// ─── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/v1/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'ok',
      environment: env.nodeEnv,
      timestamp: new Date().toISOString(),
    },
  });
});

// ─── API routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authLimiter, authRoutes);
app.use('/api/v1/employees', employeeRoutes);

// Employee task management: start onboarding + view tasks
app.post(
  '/api/v1/employees/:employeeId/onboarding',
  authenticate,
  requireHrAdmin,
  validate(startOnboardingSchema),
  OnboardingController.startOnboarding
);
app.get(
  '/api/v1/employees/:id/tasks',
  authenticate,
  requireHrAdmin,
  OnboardingController.getEmployeeTasks
);

app.use('/api/v1/onboarding', onboardingRoutes);
app.use('/api/v1/tasks', taskRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: `Route ${req.originalUrl} not found` },
  });
});

// ─── Centralized error handler ────────────────────────────────────────────────
app.use(errorHandler);

export default app;

