/** The signoff branch checks and branch resolution of the tool-registry version, in the shape helpers/signoff-scenarios.ts reads with. Not a test file. */
import { currentBranchOf, publishArtifactsBranch } from '../../signoff.js';
import { resolveDefaultBranch } from '../../branch-resolution.js';
import { createDeadline } from '../../sighting-store.js';
import type { SignoffApi } from './signoff-scenarios.js';

export const newSignoffApi: SignoffApi = {
	publishArtifactsBranch, currentBranchOf,
	resolveDefaultBranch: async input => { const deadline = createDeadline(); try { return await resolveDefaultBranch({ ...input, deadline }); } finally { deadline.dispose(); } },
};
