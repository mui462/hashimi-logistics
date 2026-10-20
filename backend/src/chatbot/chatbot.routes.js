import { Router } from 'express';
import { createChatbotDailyLimiter, createChatbotLimiter } from '../middleware/rateLimiters.js';
import { noStore } from '../middleware/noStore.js';
import { rejectOperators } from '../middleware/rejectOperators.js';
import { validate } from '../middleware/validate.js';
import { sendSuccess } from '../utils/apiResponse.js';
import { chatMessageSchema, statusSchema } from './chatbot.validator.js';
import * as service from './chatbot.service.js';

/**
 * Public AI assistant API, mounted at /api/v1/chatbot. No account, no database writes, nothing stored: the visitor's browser sends the
 * conversation so far and gets one answer back; this server asks Ollama for it. Bodies are capped at 10kb by app.js, state-changing
 * requests must come from the website's own origin (trustedOrigin), and every request that reaches Ollama counts against a per-IP
 * burst limit and a daily limit.
 */
const router = Router();

// Whether the assistant can answer right now (Ollama reachable and its model installed). Only a boolean is revealed.
router.get('/status', noStore, validate(statusSchema), async (_req, res) => {
  const { available } = await service.checkAvailability();
  sendSuccess(res, { data: { available } });
});

router.post('/messages', noStore, rejectOperators, validate(chatMessageSchema), createChatbotDailyLimiter(), createChatbotLimiter(), async (req, res) => {
  sendSuccess(res, { data: await service.reply(req.validated.body.messages) });
});

export default router;
