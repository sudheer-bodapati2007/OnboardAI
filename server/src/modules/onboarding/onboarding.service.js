// src/modules/onboarding/onboarding.service.js
import { OnboardingTemplate } from '../../models/OnboardingTemplate.js';
import { OnboardingTask } from '../../models/OnboardingTask.js';
import { Employee } from '../../models/Employee.js';
import { AppError } from '../../utils/AppError.js';
import { createNotification } from '../notifications/notifications.service.js';

// ─── Templates ───────────────────────────────────────────────────────────────

export async function listTemplates(organizationId) {
  return OnboardingTemplate.find({ organizationId, isActive: true })
    .sort({ createdAt: -1 })
    .lean();
}

export async function createTemplate(organizationId, data) {
  return OnboardingTemplate.create({ organizationId, ...data });
}

export async function updateTemplate(organizationId, templateId, data) {
  const template = await OnboardingTemplate.findOneAndUpdate(
    { _id: templateId, organizationId },
    { $set: data },
    { new: true, runValidators: true }
  ).lean();
  if (!template) throw new AppError('Template not found', 404);
  return template;
}

// ─── Task generation ─────────────────────────────────────────────────────────

/**
 * Generate persisted employee-specific tasks from a template.
 * Prevents duplicate plan generation for the same employee.
 */
export async function startOnboarding(organizationId, employeeId, templateId) {
  const employee = await Employee.findOne({ _id: employeeId, organizationId }).lean();
  if (!employee) throw new AppError('Employee not found', 404);

  const template = await OnboardingTemplate.findOne({ _id: templateId, organizationId }).lean();
  if (!template) throw new AppError('Template not found', 404);

  // Duplicate-plan guard
  const existing = await OnboardingTask.countDocuments({ employeeId, organizationId });
  if (existing > 0) {
    throw new AppError(
      'Onboarding plan already exists for this employee. Use the existing tasks.',
      409
    );
  }

  if (!template.tasks || template.tasks.length === 0) {
    throw new AppError('Template has no tasks to generate', 422);
  }

  const startDate = employee.startDate ?? new Date();

  const taskDocs = template.tasks.map((t) => {
    // Use UTC arithmetic to avoid timezone-driven day shifts.
    // employee.startDate is stored as UTC midnight; setDate/getDate would
    // apply local-timezone offsets and could shift the date by ±1 day in
    // non-UTC environments.  setUTCDate/getUTCDate stays in UTC throughout.
    const dueDate = new Date(startDate);
    dueDate.setUTCDate(dueDate.getUTCDate() + (t.dueDayOffset ?? 0));
    return {
      organizationId,
      employeeId,
      templateId: template._id,
      // Snapshot — immune to future template edits
      title: t.title,
      description: t.description ?? '',
      category: t.category ?? 'General',
      dueDate,
      order: t.order ?? 0,
      status: 'pending',
    };
  });

  const tasks = await OnboardingTask.insertMany(taskDocs);

  // Notify the employee's linked user account (fire-and-forget — never throws)
  if (employee.userId) {
    createNotification({
      organizationId,
      userId: employee.userId,
      type: 'onboarding_assigned',
      title: 'Your onboarding plan is ready',
      body: `Your onboarding checklist "${template.name}" has been assigned. ${tasks.length} task(s) await you.`,
      relatedEmployeeId: employee._id,
    }).catch(() => {});
  }

  return tasks;
}

// ─── Task views ──────────────────────────────────────────────────────────────

export async function getEmployeeTasks(organizationId, employeeId) {
  // Verify employee belongs to org
  const employee = await Employee.findOne({ _id: employeeId, organizationId }).lean();
  if (!employee) throw new AppError('Employee not found', 404);

  const tasks = await OnboardingTask.find({ employeeId, organizationId })
    .sort({ order: 1, dueDate: 1 })
    .lean();

  return { employee, tasks };
}

export async function getMyTasks(organizationId, userId) {
  // Find the employee record linked to this user account
  const employee = await Employee.findOne({ userId, organizationId }).lean();
  if (!employee) {
    return { employee: null, tasks: [] };
  }
  const tasks = await OnboardingTask.find({
    employeeId: employee._id,
    organizationId,
  })
    .sort({ order: 1, dueDate: 1 })
    .lean();
  return { employee, tasks };
}

// ─── Task status update ───────────────────────────────────────────────────────

/**
 * An employee may update only their OWN tasks.
 * HR admins can update any task in their org.
 */
export async function updateTaskStatus(organizationId, taskId, status, requestingUser) {
  const task = await OnboardingTask.findOne({ _id: taskId, organizationId });
  if (!task) throw new AppError('Task not found', 404);

  // Authorization: employees can only touch their own tasks
  if (requestingUser.role === 'employee') {
    const employee = await Employee.findOne({
      userId: requestingUser._id,
      organizationId,
    }).lean();
    if (!employee || task.employeeId.toString() !== employee._id.toString()) {
      throw new AppError('Forbidden', 403);
    }
  }

  task.status = status;
  task.completedAt = status === 'completed' ? new Date() : null;
  await task.save();

  // Notify on task completion (fire-and-forget)
  if (status === 'completed') {
    // Find the employee to get the userId for the notification recipient
    const employee = await Employee.findById(task.employeeId).lean();
    if (employee?.userId) {
      createNotification({
        organizationId,
        userId: requestingUser._id,
        type: 'task_completed',
        title: 'Task completed',
        body: `"${task.title}" was marked complete.`,
        relatedEmployeeId: task.employeeId,
        relatedTaskId: task._id,
      }).catch(() => {});
    }
  }

  return task.toObject();
}

// ─── Overview / dashboard ─────────────────────────────────────────────────────

export async function getOnboardingOverview(organizationId) {
  const now = new Date();

  const [totalEmployees, activeEmployees, onboardingEmployees] = await Promise.all([
    Employee.countDocuments({ organizationId }),
    Employee.countDocuments({ organizationId, status: 'active' }),
    Employee.countDocuments({ organizationId, status: 'onboarding' }),
  ]);

  const taskAgg = await OnboardingTask.aggregate([
    { $match: { organizationId: organizationId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] },
        },
        pending: {
          $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
        },
        overdue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $ne: ['$status', 'completed'] },
                  { $lt: ['$dueDate', now] },
                  { $ne: ['$dueDate', null] },
                ],
              },
              1,
              0,
            ],
          },
        },
      },
    },
  ]);

  const taskStats = taskAgg[0] ?? { total: 0, completed: 0, pending: 0, overdue: 0 };
  const avgCompletion =
    taskStats.total > 0
      ? Math.round((taskStats.completed / taskStats.total) * 100)
      : 0;

  // Completed onboarding journeys = employees where ALL their tasks are completed
  const completedJourneys = await getCompletedJourneyCount(organizationId);

  // Recent activity: last 10 task completions
  const recentActivity = await OnboardingTask.find({
    organizationId,
    status: 'completed',
    completedAt: { $ne: null },
  })
    .sort({ completedAt: -1 })
    .limit(10)
    .populate('employeeId', 'fullName department')
    .lean();

  // Department breakdown
  const deptBreakdown = await Employee.aggregate([
    { $match: { organizationId } },
    { $group: { _id: '$department', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);

  return {
    employees: {
      total: totalEmployees,
      active: activeEmployees,
      onboarding: onboardingEmployees,
      completedOnboarding: completedJourneys,
    },
    tasks: {
      total: taskStats.total,
      completed: taskStats.completed,
      pending: taskStats.pending,
      overdue: taskStats.overdue,
      avgCompletionPercent: avgCompletion,
    },
    recentActivity: recentActivity.map((t) => ({
      taskId: t._id,
      title: t.title,
      employeeName: t.employeeId?.fullName ?? 'Unknown',
      department: t.employeeId?.department ?? '',
      completedAt: t.completedAt,
    })),
    departmentBreakdown: deptBreakdown.map((d) => ({
      department: d._id ?? 'Unknown',
      count: d.count,
    })),
  };
}

async function getCompletedJourneyCount(organizationId) {
  // Employees who have at least 1 task and all tasks are completed
  const result = await OnboardingTask.aggregate([
    { $match: { organizationId } },
    {
      $group: {
        _id: '$employeeId',
        total: { $sum: 1 },
        completed: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
      },
    },
    {
      $match: {
        $expr: { $and: [{ $gt: ['$total', 0] }, { $eq: ['$total', '$completed'] }] },
      },
    },
    { $count: 'count' },
  ]);
  return result[0]?.count ?? 0;
}

