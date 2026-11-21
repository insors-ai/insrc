/* Copyright (c) Procix Software India. Licensed under the MIT License. */
// Run only with the independently verified bootstrap Node, never tools/node.
import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { readManagedInstallation } from '../out/shared/managed-daemon-installation.js';
import { InstallationMutationGate } from '../out/shared/installation-mutation-gate.js';
import { verifyManagedBundleProof } from '../out/daemon/managed-bundle-proof.js';

try {
 const [root, stateRoot] = process.argv.slice(2);
 if (!root || !stateRoot || await realpath(root) !== root) throw new Error('noncanonical packaged installation');
 const installation = await readManagedInstallation(stateRoot);
 if (!installation || installation.releaseRoot !== root || installation.runtime !== join(root, 'tools/node')) {
  throw new Error('packaged runtime has no matching managed installation selector');
 }
 const journal = await new InstallationMutationGate(stateRoot).read();
 if (journal.active !== null) throw new Error('a lifecycle transaction requires recovery before launching installed tools');
 if (journal.installedBundle?.releaseRoot !== root) throw new Error('packaged runtime has no retained authenticated bundle proof');
 await verifyManagedBundleProof(installation, journal.installedBundle.proof);
 process.stdout.write(installation.runtime);
} catch (error) {
 process.stderr.write(`Packaged runtime integrity verification failed: ${error.message}; repair using the authenticated installer.\n`);
 process.exitCode = 2;
}
