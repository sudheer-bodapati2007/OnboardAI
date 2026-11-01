// src/server.js
import { validateEnv } from './config/env.js';
import { connectDB } from './config/database.js';
import { configureDns } from './config/dns.js';
import { recoverStuckProcessing } from './modules/policy/policy.processor.js';
import app from './app.js';
import { env } from './config/env.js';

// Validate env before anything else
validateEnv();

async function start() {
  // Apply DNS settings before Mongoose resolves the Atlas SRV record.
  configureDns({ mongoUri: env.mongoUri });

  await connectDB();

  // Recover any documents left in 'processing' by a previous crash/restart so
  // they never remain stuck indefinitely.
  await recoverStuckProcessing().catch((err) => {
    console.error('[Policy Processor] Startup recovery failed:', err.message);
  });

  const server = app.listen(env.port, () => {
    console.log(`OnboardAI server running on port ${env.port} [${env.nodeEnv}]`);
  });

  // Graceful shutdown
  const shutdown = (signal) => {
    console.log(`\n${signal} received — shutting down gracefully...`);
    server.close(() => {
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});

