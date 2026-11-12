import { z } from 'zod';
import { structural } from '../structural-schema.js';
import { DesignRequestSchemas, DESIGN_REVIEW_PHASES } from '../../workflow/review/design-review/contracts.js';
import { ReviewResourceRecoveryInputSchema } from '../../shared/review-resources.js';
export { DESIGN_REVIEW_PHASES };
// MCP advertises the union's fields; the host enforces the exact per-phase object.
const fields:Record<string,z.ZodTypeAny>={};
for(const schema of Object.values(DesignRequestSchemas))for(const [key,value] of Object.entries(schema.properties)){
 if(!['phase','repo','reviewId','attempt'].includes(key))fields[key]=structural(value).optional();
}
export const DESIGN_REVIEW_INPUT={phase:z.enum(DESIGN_REVIEW_PHASES),repo:z.string().optional(),reviewId:structural(DesignRequestSchemas.progress.properties.reviewId),attempt:structural(DesignRequestSchemas.progress.properties.attempt),resourceRecovery:structural(ReviewResourceRecoveryInputSchema).optional().describe('Recover phase only: request exact local-broker resource clearance. This does not resume the review; submit a separate explicit recover/new-attempt afterward.'),...fields};
