// src/middleware/validate.js
// Zod request validation middleware factory.
import { AppError } from '../utils/AppError.js';

/**
 * @param {import('zod').ZodSchema} schema
 * @param {'body'|'query'|'params'} source
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));
      return next(
        Object.assign(new AppError('Validation failed', 422), {
          code: 'VALIDATION_ERROR',
          details,
        })
      );
    }
    req[source] = result.data;
    next();
  };
}

