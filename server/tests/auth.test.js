// tests/auth.test.js
// Tests auth middleware and authorization enforcement WITHOUT real credentials.
// Uses mock/stub patterns — no real Google token or MongoDB connection needed.

import assert from 'node:assert/strict';
import { describe, it, before } from 'node:test';

// ─── Unit: AppError ───────────────────────────────────────────────────────────
describe('AppError', () => {
  it('should create an operational error with correct fields', async () => {
    const { AppError } = await import('../src/utils/AppError.js');
    const err = new AppError('Not found', 404, 'NOT_FOUND');
    assert.equal(err.message, 'Not found');
    assert.equal(err.statusCode, 404);
    assert.equal(err.code, 'NOT_FOUND');
    assert.equal(err.isOperational, true);
  });
});

// ─── Unit: response helpers ───────────────────────────────────────────────────
describe('response helpers', () => {
  it('success() should send JSON with success:true', async () => {
    const { success } = await import('../src/utils/response.js');
    let sentBody;
    const res = {
      status(code) { this._code = code; return this; },
      json(body) { sentBody = body; return this; },
    };
    success(res, { foo: 'bar' }, 200);
    assert.equal(sentBody.success, true);
    assert.deepEqual(sentBody.data, { foo: 'bar' });
  });

  it('paginated() should include meta fields', async () => {
    const { paginated } = await import('../src/utils/response.js');
    let sentBody;
    const res = {
      status(code) { this._code = code; return this; },
      json(body) { sentBody = body; return this; },
    };
    paginated(res, { employees: [] }, { page: 2, limit: 10, total: 55 });
    assert.equal(sentBody.meta.page, 2);
    assert.equal(sentBody.meta.total, 55);
    assert.equal(sentBody.meta.totalPages, 6);
  });
});

// ─── Unit: validate middleware ────────────────────────────────────────────────
describe('validate middleware', () => {
  it('should call next with AppError on invalid body', async () => {
    const { validate } = await import('../src/middleware/validate.js');
    const { z } = await import('zod');
    const schema = z.object({ name: z.string().min(1) });
    const middleware = validate(schema);

    let nextCalledWith;
    const req = { body: { name: '' } };
    const res = {};
    const next = (err) => { nextCalledWith = err; };

    middleware(req, res, next);
    assert.ok(nextCalledWith, 'next should be called with an error');
    assert.equal(nextCalledWith.statusCode, 422);
  });

  it('should call next() without error on valid body', async () => {
    const { validate } = await import('../src/middleware/validate.js');
    const { z } = await import('zod');
    const schema = z.object({ name: z.string().min(1) });
    const middleware = validate(schema);

    let nextCalledWith = undefined;
    const req = { body: { name: 'Alice' } };
    const res = {};
    const next = (err) => { nextCalledWith = err; };

    middleware(req, res, next);
    assert.equal(nextCalledWith, undefined, 'next should be called without error');
  });
});

// ─── Unit: requireRole middleware ─────────────────────────────────────────────
describe('requireRole middleware', () => {
  it('should call next(403) when role does not match', async () => {
    const { requireRole } = await import('../src/middleware/auth.js');
    const middleware = requireRole('hr_admin');

    let nextCalledWith;
    const req = { user: { role: 'employee' } };
    const res = {};
    const next = (err) => { nextCalledWith = err; };

    middleware(req, res, next);
    assert.ok(nextCalledWith);
    assert.equal(nextCalledWith.statusCode, 403);
  });

  it('should call next() when role matches', async () => {
    const { requireRole } = await import('../src/middleware/auth.js');
    const middleware = requireRole('hr_admin');

    let nextCalledWith = undefined;
    const req = { user: { role: 'hr_admin' } };
    const res = {};
    const next = (err) => { nextCalledWith = err; };

    middleware(req, res, next);
    assert.equal(nextCalledWith, undefined);
  });
});

// ─── Unit: employees validation ───────────────────────────────────────────────
describe('employees validation schemas', () => {
  it('createEmployeeSchema should reject missing required fields', async () => {
    const { createEmployeeSchema } = await import('../src/modules/employees/employees.validation.js');
    const result = createEmployeeSchema.safeParse({ email: 'not-an-email' });
    assert.equal(result.success, false);
  });

  it('createEmployeeSchema should pass with valid data', async () => {
    const { createEmployeeSchema } = await import('../src/modules/employees/employees.validation.js');
    const result = createEmployeeSchema.safeParse({
      fullName: 'Alice Smith',
      email: 'alice@example.com',
      jobTitle: 'Engineer',
      department: 'Engineering',
      startDate: '2024-01-15',
    });
    assert.equal(result.success, true);
  });

  it('listQuerySchema should coerce string numbers', async () => {
    const { listQuerySchema } = await import('../src/modules/employees/employees.validation.js');
    const result = listQuerySchema.safeParse({ page: '2', limit: '10' });
    assert.equal(result.success, true);
    assert.equal(result.data.page, 2);
  });
});

// ─── Unit: onboarding validation ─────────────────────────────────────────────
describe('onboarding validation schemas', () => {
  it('createTemplateSchema should reject empty name', async () => {
    const { createTemplateSchema } = await import('../src/modules/onboarding/onboarding.validation.js');
    const result = createTemplateSchema.safeParse({ name: '' });
    assert.equal(result.success, false);
  });

  it('taskStatusSchema should only accept valid enum values', async () => {
    const { taskStatusSchema } = await import('../src/modules/onboarding/onboarding.validation.js');
    assert.equal(taskStatusSchema.safeParse({ status: 'done' }).success, false);
    assert.equal(taskStatusSchema.safeParse({ status: 'completed' }).success, true);
  });
});

// ─── Unit: errorHandler ───────────────────────────────────────────────────────
describe('errorHandler middleware', () => {
  it('should return 409 for duplicate key errors', async () => {
    const { errorHandler } = await import('../src/middleware/errorHandler.js');
    let sentStatus, sentBody;
    const res = {
      status(code) { sentStatus = code; return this; },
      json(body) { sentBody = body; },
    };
    const err = { code: 11000, keyValue: { email: 'x@x.com' } };
    errorHandler(err, {}, res, () => {});
    assert.equal(sentStatus, 409);
    assert.equal(sentBody.error.code, 'DUPLICATE');
  });

  it('should return the statusCode from AppError', async () => {
    const { errorHandler } = await import('../src/middleware/errorHandler.js');
    const { AppError } = await import('../src/utils/AppError.js');
    let sentStatus;
    const res = {
      status(code) { sentStatus = code; return this; },
      json() {},
    };
    const err = new AppError('Not found', 404);
    errorHandler(err, {}, res, () => {});
    assert.equal(sentStatus, 404);
  });
});

