// src/modules/auth/auth.routes.js
import { Router } from 'express';
import * as AuthController from './auth.controller.js';
import { authenticate } from '../../middleware/auth.js';

const router = Router();

// POST /api/v1/auth/google  – exchange Google ID token for session
router.post('/google', AuthController.googleLogin);

// GET  /api/v1/auth/me      – return authenticated user
router.get('/me', authenticate, AuthController.getMe);

// POST /api/v1/auth/logout  – clear session cookie
router.post('/logout', authenticate, AuthController.logout);

export default router;

