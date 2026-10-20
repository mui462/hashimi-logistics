import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

export async function connectDatabase() {
  mongoose.connection.on('disconnected', () => logger.warn('MongoDB disconnected.'));
  mongoose.connection.on('reconnected', () => logger.info('MongoDB reconnected.'));
  mongoose.connection.on('error', (error) => logger.error('MongoDB error:', error.message));

  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });

  const { host, name } = mongoose.connection;
  logger.info(`MongoDB connected (host: ${host}, database: ${name}).`);
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
  logger.info('MongoDB connection closed.');
}

export function getDatabaseStatus() {
  const states = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  return states[mongoose.connection.readyState] ?? 'unknown';
}
