// src/utils/response.js
// Standardised API response helpers.

export function success(res, data, statusCode = 200, meta = {}) {
  const body = { success: true, data };
  if (Object.keys(meta).length) body.meta = meta;
  return res.status(statusCode).json(body);
}

export function paginated(res, data, { page, limit, total }) {
  return res.status(200).json({
    success: true,
    data,
    meta: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
}

