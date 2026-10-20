import { z } from 'zod';

/** A 24-character hex MongoDB id. Rejects objects, arrays, and operator payloads before any query runs. */
export const objectIdSchema = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier.');

export const idParamSchema = z.object({ params: z.object({ id: objectIdSchema }) });
