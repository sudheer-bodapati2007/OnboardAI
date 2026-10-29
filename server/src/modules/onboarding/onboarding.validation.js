// src/modules/onboarding/onboarding.validation.js
import { z } from 'zod';

const templateTaskSchema = z.object({
  title: z.string().min(1).max(300).trim(),
  description: z.string().max(1000).trim().optional().default(''),
  category: z.string().max(100).trim().optional().default('General'),
  dueDayOffset: z.number().int().min(0).optional().default(0),
  order: z.number().int().min(0).optional().default(0),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(500).trim().optional().default(''),
  roleTarget: z.string().max(100).trim().optional().default('General'),
  tasks: z.array(templateTaskSchema).min(0).optional().default([]),
});

export const updateTemplateSchema = createTemplateSchema.partial();

export const startOnboardingSchema = z.object({
  templateId: z.string().min(1),
});

export const taskStatusSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed']),
});

