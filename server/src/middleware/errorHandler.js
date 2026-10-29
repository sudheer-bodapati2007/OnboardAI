// src/middleware/errorHandler.js
// Centralized Express error handler.
import { env } from '../config/env.js';

export function errorHandler(err, req, res, next) {
  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue ?? {})[0] ?? 'field';
    return res.status(409).json({
      success: false,
      error: {
        code: 'DUPLICATE',
        message: `A record with this ${field} already exists in your organization.`,
      },
    });
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const details = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return res.status(422).json({
      success: false,
      error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details },
    });
  }

  // Mongoose cast error (bad ObjectId)
  if (err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      error: { code: 'INVALID_ID', message: 'Invalid identifier format' },
    });
  }

  // Application errors
  const status = err.statusCode ?? err.status ?? 500;
  const message = err.isOperational ? err.message : 'An unexpected error occurred';

  if (!err.isOperational) {
    console.error('[Unhandled Error]', err);
  }

  res.status(status).json({
    success: false,
    error: {
      code: err.code ?? 'INTERNAL_ERROR',
      message,
      ...(env.nodeEnv === 'development' && !err.isOperational
        ? { stack: err.stack }
        : {}),
    },
  });
}

