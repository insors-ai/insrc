import { structural } from '../structural-schema.js';
import { DESIGN_REVIEW_SCHEMA } from '../review-input-schemas.js';
import type { z } from 'zod';
export { DESIGN_REVIEW_PHASES } from '../review-input-schemas.js';
export const DESIGN_REVIEW_INPUT = (structural(DESIGN_REVIEW_SCHEMA) as z.ZodObject).shape;
