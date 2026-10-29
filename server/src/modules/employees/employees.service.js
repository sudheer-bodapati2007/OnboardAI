// src/modules/employees/employees.service.js
import { Employee } from '../../models/Employee.js';
import { AppError } from '../../utils/AppError.js';

/**
 * Create a new employee within the authenticated user's organization.
 */
export async function createEmployee(organizationId, data) {
  const employee = await Employee.create({
    organizationId,
    ...data,
    startDate: new Date(data.startDate),
  });
  return employee;
}

/**
 * List employees with pagination, search, and filters.
 * organizationId is always derived server-side.
 */
export async function listEmployees(organizationId, { page, limit, search, department, status }) {
  const filter = { organizationId };

  if (status) filter.status = status;
  if (department) filter.department = new RegExp(department, 'i');
  if (search) {
    filter.$or = [
      { fullName: new RegExp(search, 'i') },
      { email: new RegExp(search, 'i') },
    ];
  }

  const skip = (page - 1) * limit;
  const [employees, total] = await Promise.all([
    Employee.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    Employee.countDocuments(filter),
  ]);

  return { employees, total, page, limit };
}

/**
 * Get one employee, enforcing org scope.
 */
export async function getEmployee(organizationId, employeeId) {
  const employee = await Employee.findOne({ _id: employeeId, organizationId }).lean();
  if (!employee) throw new AppError('Employee not found', 404);
  return employee;
}

/**
 * Update employee fields.
 */
export async function updateEmployee(organizationId, employeeId, data) {
  const update = { ...data };
  if (data.startDate) update.startDate = new Date(data.startDate);

  const employee = await Employee.findOneAndUpdate(
    { _id: employeeId, organizationId },
    { $set: update },
    { new: true, runValidators: true }
  ).lean();

  if (!employee) throw new AppError('Employee not found', 404);
  return employee;
}

/**
 * Update employee status (deactivate without deleting onboarding history).
 */
export async function updateEmployeeStatus(organizationId, employeeId, status) {
  const employee = await Employee.findOneAndUpdate(
    { _id: employeeId, organizationId },
    { $set: { status } },
    { new: true }
  ).lean();
  if (!employee) throw new AppError('Employee not found', 404);
  return employee;
}

