import { z } from 'zod';
import { checkPassword, PASSWORD_MAX_BYTES } from '../utils/passwordPolicy.js';

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email('Enter a valid email address.'));

export const passwordField = z
  .string()
  .min(10, 'Password must be at least 10 characters.')
  .refine(
    (value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES,
    `Password must be at most ${PASSWORD_MAX_BYTES} bytes.`
  );

export const nameField = z
  .string()
  .trim()
  .min(1, 'This field is required.')
  .max(60, 'Must be 60 characters or fewer.');

const companyNameField = z
  .string()
  .trim()
  .min(1, 'Company name is required.')
  .max(150, 'Must be 150 characters or fewer.');

const phoneField = z
  .string()
  .trim()
  .regex(/^[+()\-.\s\d]{7,30}$/, 'Enter a valid phone number.');

const tokenField = z.string().trim().min(1, 'The link is missing its token.').max(512);

export function applyPasswordRules(data, context) {
  if (data.password !== data.passwordConfirmation) {
    context.addIssue({ code: 'custom', path: ['passwordConfirmation'], message: 'Passwords do not match.' });
  }
  const problem = checkPassword(data.password, data);
  if (problem) {
    context.addIssue({ code: 'custom', path: ['password'], message: problem });
  }
}

export function withoutConfirmation({ passwordConfirmation: _discarded, ...rest }) {
  return rest;
}

/**
 * Registration accepts exactly these fields. Anything else (role, accountType, isActive,
 * isEmailVerified, permissions...) fails .strict(), so a client cannot smuggle in privileges.
 * The account type is decided by the endpoint, never by the request.
 */
const registrationBody = z
  .object({
    firstName: nameField,
    lastName: nameField,
    companyName: companyNameField,
    email: emailField,
    phone: phoneField.optional(),
    password: passwordField,
    passwordConfirmation: z.string(),
  })
  .strict()
  .superRefine(applyPasswordRules)
  .transform(withoutConfirmation);

export const registerCustomerSchema = z.object({ body: registrationBody });
export const registerCarrierSchema = z.object({ body: registrationBody });

export const loginSchema = z.object({
  body: z
    .object({
      email: emailField,
      password: z.string().min(1, 'Enter your password.').max(128),
      // Which sign-in page was used. It only narrows who may sign in here; the role always comes from the account itself.
      portal: z.enum(['customer', 'carrier']).optional(),
    })
    .strict(),
});

export const forgotPasswordSchema = z.object({
  body: z.object({ email: emailField }).strict(),
});

export const resetPasswordSchema = z.object({
  body: z
    .object({
      token: tokenField,
      password: passwordField,
      passwordConfirmation: z.string(),
    })
    .strict()
    .superRefine(applyPasswordRules)
    .transform(withoutConfirmation),
});

export const verifyEmailSchema = z.object({
  body: z.object({ token: tokenField }).strict(),
});

const googleCredential = z.string().trim().min(20).max(4096);

export const googleLoginSchema = z.object({
  body: z.object({ credential: googleCredential, portal: z.enum(['customer', 'carrier']) }).strict(),
});

/** Google registration: the account type comes from the endpoint, never from the body. */
export const googleRegisterSchema = z.object({
  body: z.object({ credential: googleCredential, companyName: companyNameField, phone: phoneField.optional() }).strict(),
});
