// src/config/database.js
import mongoose from 'mongoose';
import { env } from './env.js';
import { configureDns } from './dns.js';

export async function connectDB() {
  // Must happen before mongoose.connect(): resolving a mongodb+srv:// URI
  // uses the c-ares resolver, which may point at 127.0.0.1 on Windows.
  configureDns({ mongoUri: env.mongoUri });

  try {
    const conn = await mongoose.connect(env.mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    process.exit(1);
  }
}

