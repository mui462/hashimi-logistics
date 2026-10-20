import { z } from 'zod';
import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import { User } from '../src/models/User.js';
import { hashPassword } from '../src/services/password.service.js';
import { ACCOUNT_TYPES } from '../src/utils/constants.js';
import { logger } from '../src/utils/logger.js';
import { checkPassword } from '../src/utils/passwordPolicy.js';
import { emailField, nameField, passwordField } from '../src/validators/auth.validator.js';

const seedSchema = z.object({
  SUPER_ADMIN_EMAIL: emailField,
  SUPER_ADMIN_PASSWORD: passwordField,
  SUPER_ADMIN_FIRST_NAME: nameField,
  SUPER_ADMIN_LAST_NAME: nameField,
});

async function seedSuperAdmin() {
  const parsed = seedSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    logger.error(`Missing or invalid Super Admin settings:\n${problems.join('\n')}`);
    process.exitCode = 1;
    return;
  }

  const policyProblem = checkPassword(parsed.data.SUPER_ADMIN_PASSWORD, {
    email: parsed.data.SUPER_ADMIN_EMAIL,
    firstName: parsed.data.SUPER_ADMIN_FIRST_NAME,
    lastName: parsed.data.SUPER_ADMIN_LAST_NAME,
  });
  if (policyProblem) {
    logger.error(`SUPER_ADMIN_PASSWORD rejected: ${policyProblem}`);
    process.exitCode = 1;
    return;
  }

  await connectDatabase();
  try {
    const existing = await User.exists({ role: ACCOUNT_TYPES.SUPER_ADMIN });
    if (existing) {
      logger.warn('A Super Admin already exists. Nothing was changed.');
      return;
    }

    const values = parsed.data;
    await User.create({
      firstName: values.SUPER_ADMIN_FIRST_NAME,
      lastName: values.SUPER_ADMIN_LAST_NAME,
      email: values.SUPER_ADMIN_EMAIL,
      passwordHash: await hashPassword(values.SUPER_ADMIN_PASSWORD),
      role: ACCOUNT_TYPES.SUPER_ADMIN,
      isEmailVerified: true,
    });
    logger.info(`Super Admin created for ${values.SUPER_ADMIN_EMAIL}.`);
  } finally {
    await disconnectDatabase();
  }
}

seedSuperAdmin().catch((error) => {
  logger.error('Seeding failed:', error.message);
  process.exitCode = 1;
  return disconnectDatabase();
});
