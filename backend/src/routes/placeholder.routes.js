import { Router } from 'express';
import { getPlaceholder } from '../controllers/placeholder.controller.js';

export function createPlaceholderRouter(moduleName) {
  const router = Router();
  router.get('/', getPlaceholder(moduleName));
  return router;
}
