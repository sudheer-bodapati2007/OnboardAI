// src/modules/employees/employees.service.js
import { Employee } from '../../models/Employee.js';
import { AppError } from '../../utils/AppError.js';
import { storage } from '../../config/storage.js';
import { env } from '../../config/env.js';
import { randomUUID } from 'node:crypto';
import { validateImageSignature } from './employees.upload.js';

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
 * Upload a profile image for the authenticated user's own employee record.
 * Only the user linked to the employee record can upload their own image.
 */
export async function uploadProfileImage(organizationId, userId, buffer, originalName, mimeType) {
  // Validate actual image content (magic bytes)
  if (!validateImageSignature(buffer)) {
    throw new AppError('File does not appear to be a valid image', 400);
  }

  // Find the employee linked to this user account
  const employee = await Employee.findOne({ userId, organizationId });
  if (!employee) throw new AppError('Employee record not found', 404);

  // Generate a safe storage key
  const ext = originalName.split('.').pop() ?? 'jpg';
  const storageKey = `${organizationId}/profile-images/${userId}/${randomUUID()}.${ext}`;

  // Persist file
  await storage.save(storageKey, buffer);

  // Build a public URL for the image
  let imageUrl;
  if (env.storageProvider === 'gcs') {
    imageUrl = `https://storage.googleapis.com/${env.gcsBucket}/${storageKey}`;
  } else {
    // Local storage — serve via a static endpoint or direct path
    imageUrl = `/uploads/${storageKey}`;
  }

  // Update employee record
  const updated = await Employee.findOneAndUpdate(
    { _id: employee._id, organizationId },
    { $set: { profileImageUrl: imageUrl } },
    { new: true }
  ).lean();

  if (!updated) throw new AppError('Employee not found', 404);
  return updated;
}

