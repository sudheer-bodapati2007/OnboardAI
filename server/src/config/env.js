// src/config/env.js
// Validates required environment variables at startup.
// Reports NAMES of missing variables, never their values.

import 'dotenv/config';

const REQUIRED = [
  'MONGODB_URI',
  'GOOGLE_CLIENT_ID',
  'JWT_SECRET',
  'CLIENT_URL',
];

export function validateEnv() {
  const missing = REQUIRED.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Copy server/.env.example to server/.env and fill in the values.'
    );
  }
}

export const env = {
  port: parseInt(process.env.PORT ?? '5000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  mongoUri: process.env.MONGODB_URI,
  googleClientId: process.env.GOOGLE_CLIENT_ID,
  jwtSecret: process.env.JWT_SECRET,
  clientUrl: process.env.CLIENT_URL ?? 'http://localhost:5173',
  adminSeedEmail: process.env.ADMIN_SEED_EMAIL ?? null,
  isProd: process.env.NODE_ENV === 'production',
};

