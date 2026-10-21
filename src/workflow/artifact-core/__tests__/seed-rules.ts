import { FileSidecarStore, ensureSidecarRepoRules } from '../sidecar-store.js';

/** Put the sidecar merge rules and the journal ignore entry in a test repository, as a repository that has used the store already has them (committed). */
export function seedSidecarRules(repo: string): void {
	ensureSidecarRepoRules(repo, new FileSidecarStore(repo));
}
