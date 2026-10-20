import { z } from 'zod';
import { DELIVERY_CATEGORIES, DELIVERY_CHANNELS, DELIVERY_STATUSES, NOTIFICATION_TYPES } from '../models/enums.js';
import { idParamSchema } from '../validators/common.validator.js';

export { idParamSchema };

export const emptyPreferencesQuery = z.object({ query: z.object({}).strict() });

export const updatePreferencesSchema = z.object({
  body: z
    .object({
      emailNotifications: z.boolean().optional(),
      smsNotifications: z.boolean().optional(),
      quoteNotifications: z.boolean().optional(),
      shipmentNotifications: z.boolean().optional(),
      documentNotifications: z.boolean().optional(),
    })
    .strict()
    .refine((body) => Object.keys(body).length > 0, 'Send at least one preference to change.'),
});

export const listDeliveriesSchema = z.object({
  query: z
    .object({
      page: z.coerce.number().int().min(1).max(10000).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      channel: z.enum(DELIVERY_CHANNELS).optional(),
      status: z.enum(DELIVERY_STATUSES).optional(),
      category: z.enum(DELIVERY_CATEGORIES).optional(),
      type: z.enum([...NOTIFICATION_TYPES, 'auth']).optional(),
    })
    .strict(),
});

export const retryDeliverySchema = z.object({ params: idParamSchema.shape.params, body: z.object({}).strict() });
