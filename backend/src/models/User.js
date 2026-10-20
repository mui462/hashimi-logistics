import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { ACCOUNT_TYPES, ACCOUNT_TYPE_VALUES } from '../utils/constants.js';

/**
 * Security fields (all `select: false`, so they are never returned or serialized by default):
 *   passwordHash                      bcrypt hash
 *   tokenVersion                      bumped to revoke every existing session (logout, password reset)
 *   passwordChangedAt                 when the password last changed
 *   emailVerificationTokenHash/Expires, passwordResetTokenHash/Expires
 *                                     SHA-256 of a one-time random token and its expiry. The raw
 *                                     token is only ever sent to the user and is never stored.
 */
const userSchema = createSchema(
  {
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
    },
    phone: { type: String, trim: true, maxlength: 30 },
    passwordHash: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ACCOUNT_TYPE_VALUES,
      default: ACCOUNT_TYPES.CUSTOMER,
      required: true,
    },
    avatar: {
      url: { type: String, trim: true },
      publicId: { type: String, trim: true },
    },
    isActive: { type: Boolean, default: true },
    isEmailVerified: { type: Boolean, default: false },
    lastLogin: { type: Date },
    // Google account (the OIDC "sub" claim) linked to this login. Set only after a server-verified Google sign-in.
    googleSubject: { type: String, trim: true, maxlength: 255, select: false },
    tokenVersion: { type: Number, default: 0, min: 0, select: false },
    passwordChangedAt: { type: Date, select: false },
    emailVerificationTokenHash: { type: String, select: false },
    emailVerificationExpires: { type: Date, select: false },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },
    // Phase 11. Only changed through the dedicated preferences endpoints. Security emails (password reset, verification)
    // ignore these flags. SMS is off until the user opts in.
    notificationPreferences: {
      emailNotifications: { type: Boolean, default: true },
      smsNotifications: { type: Boolean, default: false },
      quoteNotifications: { type: Boolean, default: true },
      shipmentNotifications: { type: Boolean, default: true },
      documentNotifications: { type: Boolean, default: true },
    },
  },
  { collection: 'users', hiddenFromJson: ['notificationPreferences'] }
);

userSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.index({ role: 1, createdAt: -1 });

userSchema.index(
  { role: 1 },
  {
    unique: true,
    partialFilterExpression: { role: ACCOUNT_TYPES.SUPER_ADMIN },
    name: 'single_super_admin',
  }
);

userSchema.index({ googleSubject: 1 }, { unique: true, partialFilterExpression: { googleSubject: { $type: 'string' } }, name: 'google_subject_unique' });
userSchema.index({ emailVerificationTokenHash: 1 }, { sparse: true });
userSchema.index({ passwordResetTokenHash: 1 }, { sparse: true });

export const User = mongoose.model('User', userSchema);
