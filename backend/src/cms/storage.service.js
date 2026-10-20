// Phase 10: the media storage abstraction moved to ../storage/ (provider drivers, validation, safe errors).
// This file keeps the Phase 9 import path working.
export { getStorageDriver, getStorageStatus } from '../storage/index.js';
