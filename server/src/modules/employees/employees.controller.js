// src/modules/employees/employees.controller.js
import * as EmployeesService from './employees.service.js';
import { success, paginated } from '../../utils/response.js';
import { validateImageSignature } from './employees.upload.js';

export async function createEmployee(req, res, next) {
  try {
    const employee = await EmployeesService.createEmployee(
      req.user.organizationId,
      req.body
    );
    return success(res, { employee }, 201);
  } catch (err) {
    next(err);
  }
}

export async function listEmployees(req, res, next) {
  try {
    const { employees, total, page, limit } = await EmployeesService.listEmployees(
      req.user.organizationId,
      req.query
    );
    return paginated(res, { employees }, { page, limit, total });
  } catch (err) {
    next(err);
  }
}

export async function getEmployee(req, res, next) {
  try {
    const employee = await EmployeesService.getEmployee(
      req.user.organizationId,
      req.params.id
    );
    return success(res, { employee });
  } catch (err) {
    next(err);
  }
}

export async function updateEmployee(req, res, next) {
  try {
    const employee = await EmployeesService.updateEmployee(
      req.user.organizationId,
      req.params.id,
      req.body
    );
    return success(res, { employee });
  } catch (err) {
    next(err);
  }
}

export async function updateEmployeeStatus(req, res, next) {
  try {
    const employee = await EmployeesService.updateEmployeeStatus(
      req.user.organizationId,
      req.params.id,
      req.body.status
    );
    return success(res, { employee });
  } catch (err) {
    next(err);
  }
}

export async function uploadProfileImage(req, res, next) {
  try {
    // Only allow users to update their own profile image
    const employee = await EmployeesService.uploadProfileImage(
      req.user.organizationId,
      req.user._id,
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );
    return success(res, { employee });
  } catch (err) {
    next(err);
  }
}

