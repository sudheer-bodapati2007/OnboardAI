// src/modules/policy/policy.upload.js
// Multer configuration for PDF uploads.
// Files are stored in memory (buffer) — never on disk via multer.
// Actual persistence is handled by the storage adapter.
import multer from 'multer';
import { AppError } from '../../utils/AppError.js';
import { env } from '../../config/env.js';

const MAX_BYTES = env.maxUploadMb * 1024 * 1024;

// Multer: memory storage (buffers only, no temp files)
export const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    // Check declared MIME type
    if (file.mimetype !== 'application/pdf') {
      return cb(new AppError('Only PDF files are allowed', 400));
    }
    cb(null, true);
  },
}).single('file');

/**
 * Validate PDF magic bytes (first 4 bytes must be %PDF).
 * This runs after multer so we have the buffer available.
 */
export function validatePdfSignature(buffer) {
  if (!buffer || buffer.length < 4) return false;
  // PDF files start with %PDF (hex: 25 50 44 46)
  return (
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  );
}

/**
 * Express error middleware to convert multer errors into AppErrors.
 */
export function handleUploadError(err, req, res, next) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new AppError(`File too large. Maximum allowed size is ${env.maxUploadMb} MB.`, 400));
    }
    return next(new AppError(`Upload error: ${err.message}`, 400));
  }
  next(err);
}

