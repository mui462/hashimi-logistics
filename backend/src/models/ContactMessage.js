import mongoose from 'mongoose';
import { createSchema } from './createSchema.js';
import { CONTACT_INTERESTS, CONTACT_MESSAGE_STATUSES } from './enums.js';
import { emailField, objectIdRef, phoneField, requiredText, textField } from './helpers/fields.js';
import { softDeletePlugin } from './plugins/softDelete.plugin.js';

/**
 * A message sent through the public website's contact form. The sender has no account, so there is no userId.
 * Nothing is e-mailed from here: the Super Admin reads these in the admin inbox and marks them handled.
 */
const contactMessageSchema = createSchema(
  {
    name: requiredText(120, 'Name'),
    company: textField(150),
    email: emailField({ required: [true, 'Email is required.'] }),
    phone: phoneField(),
    interest: { type: String, enum: CONTACT_INTERESTS, required: [true, 'Interest is required.'] },
    subject: requiredText(150, 'Subject'),
    message: requiredText(3000, 'Message'),
    status: { type: String, enum: CONTACT_MESSAGE_STATUSES, default: 'new' },
    handledBy: objectIdRef('User', { select: false }),
    handledAt: Date,
  },
  { collection: 'contact_messages' }
);

contactMessageSchema.plugin(softDeletePlugin);

contactMessageSchema.index({ status: 1, createdAt: -1 });
contactMessageSchema.index({ createdAt: -1 });
contactMessageSchema.index({ email: 1, createdAt: -1 });

export const ContactMessage = mongoose.model('ContactMessage', contactMessageSchema);
