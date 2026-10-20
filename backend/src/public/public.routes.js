import { Router } from 'express';
import { createPublicFormLimiter, createTrackingLimiter } from '../middleware/rateLimiters.js';
import { noStore } from '../middleware/noStore.js';
import { rejectOperators } from '../middleware/rejectOperators.js';
import { validate } from '../middleware/validate.js';
import { requestContext } from '../services/activity.service.js';
import { sendSuccess } from '../utils/apiResponse.js';
import * as service from './public.service.js';
import * as v from './public.validator.js';

/**
 * Public website API (no account): the guest quote request, carrier application and contact form, plus tracking by number.
 * Mounted at /api/v1 before the Phase 1 placeholder modules, so their GET / answers are unchanged.
 * JSON only (no file uploads from anonymous visitors); bodies are capped at 10kb by app.js; state-changing requests must come
 * from the website's own origin (trustedOrigin); each form has its own per-IP limit.
 */
const router = Router();

router.post('/quotes', noStore, createPublicFormLimiter('quote'), rejectOperators, validate(v.publicQuoteSchema), async (req, res) => {
  const { quoteNumber } = await service.createGuestQuote(req.validated.body, requestContext(req));
  sendSuccess(res, {
    statusCode: 201,
    message: 'Your quote request was received. Our team will review it and contact you. No email confirmation is sent.',
    data: { quoteNumber },
  });
});

router.post('/carrier-applications', noStore, createPublicFormLimiter('carrier-application'), rejectOperators, validate(v.carrierApplicationSchema), async (req, res) => {
  await service.createCarrierApplication(req.validated.body, requestContext(req));
  sendSuccess(res, {
    statusCode: 201,
    message: 'Your application was received. Our team will review it and contact you about next steps. No email confirmation is sent.',
  });
});

router.post('/contact', noStore, createPublicFormLimiter('contact'), rejectOperators, validate(v.contactMessageSchema), async (req, res) => {
  await service.createContactMessage(req.validated.body, requestContext(req));
  sendSuccess(res, {
    statusCode: 201,
    message: 'Your message was received. Our team will review it and follow up. No email confirmation is sent.',
  });
});

router.get('/tracking/:trackingNumber', noStore, createTrackingLimiter(), validate(v.trackingNumberSchema), async (req, res) => {
  sendSuccess(res, { data: await service.trackPublicShipment(req.validated.params.trackingNumber) });
});

export default router;
