// src/middleware/auth.js
// Verifies the HttpOnly JWT session cookie and attaches req.user.
import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export async function authenticate(req, res, next) {
  try {
    const token = req.cookies?.token;
    if (!token) {
      return next(new AppError('Authentication required', 401));
    }

    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      return next(new AppError('Invalid or expired session', 401));
    }

    const user = await User.findById(payload.userId).select('-__v').lean();
    if (!user) {
      return next(new AppError('User account not found', 401));
    }
    if (!user.isActive) {
      return next(new AppError('Account is deactivated', 403));
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('Insufficient permissions', 403));
    }
    next();
  };
}

export function requireHrAdmin(req, res, next) {
  return requireRole('hr_admin')(req, res, next);
}

