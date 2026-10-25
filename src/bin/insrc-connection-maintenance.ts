#!/usr/bin/env node
/** Daemon-owned offline maintenance entry. CLI never opens the graph or keychain. */
import { lstat } from 'node:fs/promises';
import { PATHS } from '../shared/paths.js';
import { readProtected } from '../daemon/db/management-files.js';
import { adoptManagedRoot } from '../daemon/db/management-adoption.js';
import type { StoppedDaemonEvidence } from '../daemon/db/management-state.js';
import { connectionManagementEnablement } from '../daemon/db/management-enablement.js';
import { credentialKeystore } from '../daemon/db/secrets.js';
import '../daemon/db/drivers/index.js';
async function main() {
	const [root, proofPath, ...extra] = process.argv.slice(2);
	if (!root || !proofPath || extra.length)
		throw new Error();
	// A new daemon or unknown socket after the stop invalidates maintenance admission.
	for (const path of [PATHS.pidFile, PATHS.sockFile]) {
		try {
			await lstat(path);
			throw new Error('Daemon control files remain.');
		}
		catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
				throw error;
		}
	}
	const proof = JSON.parse((await readProtected(proofPath)).bytes.toString('utf8')) as StoppedDaemonEvidence;
	const { getDb } = await import('../db/client.js'), { listRepos } = await import('../db/repos.js'), { closeGraphStore } = await import('../db/graph/store.js');
	try {
		const db = await getDb();
		await adoptManagedRoot(root, { stopped: proof, keystore: credentialKeystore, enablement: connectionManagementEnablement, isRegistered: async (candidate) => (await listRepos(db)).some(repo => repo.path === candidate) });
	}
	finally {
		await closeGraphStore();
	}
}
main().catch(() => {
	process.stderr.write('Connection maintenance failed; management remains disabled pending recovery.\n');
	process.exitCode = 1;
});
