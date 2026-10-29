// src/modules/employees/employees.validation.js
import { z } from 'zod';

export const createEmployeeSchema = z.object({
  fullName: z.string().min(1).max(200).trim(),
  email: z.string().email().toLowerCase(),
  jobTitle: z.string().min(1).max(150).trim(),
  department: z.string().min(1).max(150).trim(),
  manager: z.string().max(200).trim().optional().nullable(),
  startDate: z.string().refine((v) => !isNaN(Date.parse(v)), {
    message: 'startDate must be a valid date',
  }),
  status: z.enum(['active', 'inactive', 'onboarding']).optional().default('onboarding'),
});

export const updateEmployeeSchema = createEmployeeSchema.partial();

export const statusUpdateSchema = z.object({
  status: z.enum(['active', 'inactive', 'onboarding']),
});

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().max(200).optional(),
  department: z.string().max(150).optional(),
  status: z.enum(['active', 'inactive', 'onboarding']).optional(),
});

