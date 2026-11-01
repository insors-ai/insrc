/** The handoff's git reads of the tool-registry version, in the shape helpers/handoff-scenarios.ts reads with. Not a test file. */
import { inferStageWorkflow, unitDraftFiles, verifyReceivingRepo } from '../../handoff.js';
import type { HandoffApi } from './handoff-scenarios.js';

export const newHandoffApi: HandoffApi = {
	unitDraftFiles: (repo, unit) => unitDraftFiles(repo, unit),
	inferStageWorkflow: (repo, unit) => inferStageWorkflow(repo, unit),
	verifyReceivingRepo: (repo, repositoryId, listRepos) => verifyReceivingRepo(repo, repositoryId, { listRepos }),
};
