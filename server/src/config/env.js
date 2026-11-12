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

// AI variables — optional at startup; checked when AI routes are called
const AI_VARS = ['GEMINI_API_KEY'];

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

  // AI provider
  geminiApiKey: process.env.GEMINI_API_KEY ?? null,
  geminiChatModel: process.env.GEMINI_CHAT_MODEL ?? 'gemini-3.8-flash',
  geminiEmbedModel: process.env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001',

  // Gemini request reliability
  geminiRequestTimeoutMs: parseInt(process.env.GEMINI_REQUEST_TIMEOUT_MS ?? '30000', 10),
  geminiEmbedTimeoutMs: parseInt(process.env.GEMINI_EMBED_TIMEOUT_MS ?? '8000', 10),
  geminiMaxRetries: parseInt(process.env.GEMINI_MAX_RETRIES ?? '2', 10),
  // Wall-clock budget for the whole chat retry loop (prompt generation).
  // Must stay below the hosting proxy's request timeout (Render: ~100s) so the
  // server always answers instead of the proxy dropping the connection.
  geminiTotalTimeoutMs: parseInt(process.env.GEMINI_TOTAL_TIMEOUT_MS ?? '55000', 10),

  // Storage
  storageProvider: process.env.STORAGE_PROVIDER ?? 'local',
  storageLocalDir: process.env.STORAGE_LOCAL_DIR ?? 'uploads',
  // GCS (used when STORAGE_PROVIDER=gcs)
  gcsBucket: process.env.GCS_BUCKET ?? null,

  // Upload limits
  maxUploadMb: parseInt(process.env.MAX_UPLOAD_MB ?? '20', 10),
};
