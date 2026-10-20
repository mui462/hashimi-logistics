import { Router } from 'express';
import { adminLogin, getCurrentUser, googleConfig, googleLogin, googleRegisterCarrier, googleRegisterCustomer, login, logout, registerCarrier, registerCustomer } from '../controllers/auth.controller.js';
import { resendVerification, verifyEmail } from '../controllers/emailVerification.controller.js';
import { forgotPassword, resetPassword } from '../controllers/passwordReset.controller.js';
import { authenticate } from '../middleware/authenticate.js';
import { noStore } from '../middleware/noStore.js';
import { createAuthLimiter, createLoginAccountLimiter, createResendVerificationLimiter, createResetEmailLimiter } from '../middleware/rateLimiters.js';
import { validate } from '../middleware/validate.js';
import {
  forgotPasswordSchema,
  googleLoginSchema,
  googleRegisterSchema,
  loginSchema,
  registerCarrierSchema,
  registerCustomerSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from '../validators/auth.validator.js';

const router = Router();

router.use(noStore);

router.post('/register/customer', createAuthLimiter(), validate(registerCustomerSchema), registerCustomer);
router.post('/register/carrier', createAuthLimiter(), validate(registerCarrierSchema), registerCarrier);

router.post('/login', createAuthLimiter(), validate(loginSchema), createLoginAccountLimiter(), login);
router.get('/google/config', googleConfig);
router.post('/google/login', createAuthLimiter(), validate(googleLoginSchema), googleLogin);
router.post('/google/register/customer', createAuthLimiter(), validate(googleRegisterSchema), googleRegisterCustomer);
router.post('/google/register/carrier', createAuthLimiter(), validate(googleRegisterSchema), googleRegisterCarrier);

router.post('/admin/login', createAuthLimiter(), validate(loginSchema), createLoginAccountLimiter(), adminLogin);
router.post('/logout', logout);
router.get('/me', authenticate, getCurrentUser);

router.post('/forgot-password', createAuthLimiter(), validate(forgotPasswordSchema), createResetEmailLimiter(), forgotPassword);
router.post('/reset-password', createAuthLimiter(), validate(resetPasswordSchema), resetPassword);

router.post('/verify-email', createAuthLimiter(), validate(verifyEmailSchema), verifyEmail);
router.post('/resend-verification', createAuthLimiter(), authenticate, createResendVerificationLimiter(), resendVerification);

export default router;
