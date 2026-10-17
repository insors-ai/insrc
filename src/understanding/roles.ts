import { roleDescriptor } from '../config/role-taxonomy.js';
import { AssessmentError } from '../shared/understanding.js';

export const understandingRoles = ['understanding.classify', 'understanding.generate', 'understanding.grade', 'understanding.verify', 'understanding.guide'] as const;
export function assertUnderstandingRoles(lookup = roleDescriptor): void {
  for (const id of understandingRoles) {
    const role = lookup(id);
    if (!role || role.criticality !== 'critical' || role.defaultTier !== 'core') throw new AssessmentError('unavailable');
  }
}
