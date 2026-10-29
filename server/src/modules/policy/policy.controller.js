// src/modules/policy/policy.controller.js
import * as PolicyService from './policy.service.js';
import { uploadMiddleware, validatePdfSignature, handleUploadError } from './policy.upload.js';
import { AppError } from '../../utils/AppError.js';
import { success } from '../../utils/response.js';

export async function uploadPolicy(req, res, next) {
  // Run multer middleware inline
  uploadMiddleware(req, res, async (err) => {
    if (err) return handleUploadError(err, req, res, next);

    try {
      if (!req.file) {
        return next(new AppError('No file uploaded', 400));
      }

      const { buffer, originalname, mimetype, size } = req.file;

      // Validate PDF magic bytes
      if (!validatePdfSignature(buffer)) {
        return next(new AppError('File does not appear to be a valid PDF', 400));
      }

      const doc = await PolicyService.uploadPolicy(
        req.user.organizationId,
        req.user._id,
        { buffer, originalName: originalname, mimeType: mimetype, size }
      );

      return success(res, { document: doc }, 201);
    } catch (err) {
      next(err);
    }
  });
}

export async function listPolicies(req, res, next) {
  try {
    const documents = await PolicyService.listPolicies(req.user.organizationId);
    return success(res, { documents });
  } catch (err) {
    next(err);
  }
}

export async function deletePolicy(req, res, next) {
  try {
    await PolicyService.deletePolicy(req.user.organizationId, req.params.id);
    return success(res, { message: 'Policy document deleted' });
  } catch (err) {
    next(err);
  }
}

