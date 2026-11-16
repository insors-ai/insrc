import { structural } from '../structural-schema.js';
import { CODE_REVIEW_SCHEMA } from '../review-input-schemas.js';
import type { z } from 'zod';
export { CODE_REVIEW_PHASES } from '../review-input-schemas.js';
export const CODE_REVIEW_INPUT = (structural(CODE_REVIEW_SCHEMA) as z.ZodObject).shape;
