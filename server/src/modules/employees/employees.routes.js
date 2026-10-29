// src/modules/employees/employees.routes.js
import { Router } from 'express';
import * as EmployeesController from './employees.controller.js';
import { authenticate, requireHrAdmin } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import {
  createEmployeeSchema,
  updateEmployeeSchema,
  statusUpdateSchema,
  listQuerySchema,
} from './employees.validation.js';

const router = Router();

// All employee routes require authentication
router.use(authenticate);

// HR admin only: create, list, get, update, status
router.post(
  '/',
  requireHrAdmin,
  validate(createEmployeeSchema),
  EmployeesController.createEmployee
);

router.get(
  '/',
  requireHrAdmin,
  validate(listQuerySchema, 'query'),
  EmployeesController.listEmployees
);

router.get('/:id', requireHrAdmin, EmployeesController.getEmployee);

router.patch(
  '/:id',
  requireHrAdmin,
  validate(updateEmployeeSchema),
  EmployeesController.updateEmployee
);

router.patch(
  '/:id/status',
  requireHrAdmin,
  validate(statusUpdateSchema),
  EmployeesController.updateEmployeeStatus
);

export default router;

