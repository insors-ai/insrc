/** The policy reader and anchor finder of the tool-registry version, in the shape helpers/policy-scenarios.ts reads with. Not a test file. */
import { findAnchor } from '../../anchor-finder.js';
import { probeGitRepo, probeRemote, readPolicy, remoteHeadBranch } from '../../policy-reader.js';
import type { PolicyApi } from './policy-scenarios.js';

export const newApi: PolicyApi = {
	readPolicy: (repo, opts) => readPolicy(repo, opts),
	findAnchor: (repo, ref) => findAnchor(repo, ref),
	probeGitRepo: repo => probeGitRepo(repo),
	probeRemote: repo => probeRemote(repo),
	remoteHeadBranch: (repo, remote) => remoteHeadBranch(repo, remote),
};
