// src/modules/onboarding/onboarding.controller.js
import * as OnboardingService from './onboarding.service.js';
import { success } from '../../utils/response.js';

// ─── Templates ───────────────────────────────────────────────────────────────

export async function listTemplates(req, res, next) {
  try {
    const templates = await OnboardingService.listTemplates(req.user.organizationId);
    return success(res, { templates });
  } catch (err) {
    next(err);
  }
}

export async function createTemplate(req, res, next) {
  try {
    const template = await OnboardingService.createTemplate(
      req.user.organizationId,
      req.body
    );
    return success(res, { template }, 201);
  } catch (err) {
    next(err);
  }
}

export async function updateTemplate(req, res, next) {
  try {
    const template = await OnboardingService.updateTemplate(
      req.user.organizationId,
      req.params.id,
      req.body
    );
    return success(res, { template });
  } catch (err) {
    next(err);
  }
}

// ─── Tasks ───────────────────────────────────────────────────────────────────

export async function startOnboarding(req, res, next) {
  try {
    const tasks = await OnboardingService.startOnboarding(
      req.user.organizationId,
      req.params.employeeId,
      req.body.templateId
    );
    return success(res, { tasks, count: tasks.length }, 201);
  } catch (err) {
    next(err);
  }
}

// ─── Flexible task assignment ────────────────────────────────────────────────

/**
 * HR assigns an additional task to an employee at any lifecycle stage
 * (works even when the employee's onboarding is already completed).
 */
export async function createTask(req, res, next) {
  try {
    const task = await OnboardingService.createTaskForEmployee(
      req.user.organizationId,
      req.params.employeeId,
      req.body
    );
    return success(res, { task }, 201);
  } catch (err) {
    next(err);
  }
}

export async function getEmployeeTasks(req, res, next) {  try {
    const result = await OnboardingService.getEmployeeTasks(
      req.user.organizationId,
      req.params.id
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function getMyTasks(req, res, next) {
  try {
    const result = await OnboardingService.getMyTasks(
      req.user.organizationId,
      req.user._id
    );
    return success(res, result);
  } catch (err) {
    next(err);
  }
}

export async function updateTaskStatus(req, res, next) {
  try {
    const task = await OnboardingService.updateTaskStatus(
      req.user.organizationId,
      req.params.id,
      req.body.status,
      req.user
    );
    return success(res, { task });
  } catch (err) {
    next(err);
  }
}

export async function getOverview(req, res, next) {
  try {
    const overview = await OnboardingService.getOnboardingOverview(req.user.organizationId);
    return success(res, overview);
  } catch (err) {
    next(err);
  }
}

