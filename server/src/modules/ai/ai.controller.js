// src/modules/ai/ai.controller.js
import { z } from 'zod';
import { answerQuestion } from './ai.chat.js';
import { success } from '../../utils/response.js';
import { AppError } from '../../utils/AppError.js';

const chatSchema = z.object({
  question: z.string().min(1, 'Question is required').max(1000, 'Question too long'),
  history: z.array(z.object({
    role: z.enum(['user', 'model']),
    text: z.string().max(2000),
  })).max(20).optional().default([]),
});

export async function chat(req, res, next) {
  try {
    const parsed = chatSchema.safeParse(req.body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((e) => ({ field: e.path.join('.'), message: e.message }));
      return next(Object.assign(new AppError('Validation failed', 422), { code: 'VALIDATION_ERROR', details }));
    }

    const { question } = parsed.data;
    const { answer, sources, insufficient } = await answerQuestion(
      req.user.organizationId,
      question
    );

    return success(res, { answer, sources, insufficient });
  } catch (err) {
    next(err);
  }
}

