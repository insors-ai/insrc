/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { createPublicKey } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const [keyFile, output] = process.argv.slice(2);
if (keyFile === undefined || output === undefined) {
	throw new Error('usage: node scripts/bundle-release-bootstrap.mjs ROOT_PUBLIC_KEY OUTPUT_INSTALLER');
}
const key = createPublicKey(readFileSync(keyFile));
if (key.asymmetricKeyType !== 'ed25519') throw new Error('release root must be Ed25519');
const root = fileURLToPath(new URL('../', import.meta.url));
const keyValue = key.export({ format: 'der', type: 'spki' }).toString('base64');
const bundled = spawnSync(new URL('../node_modules/.bin/esbuild', import.meta.url).pathname, [
	'src/bin/insrc-release-bootstrap.ts', '--bundle',
	'--platform=node', '--format=esm', '--target=node20',
	`--define:__INSRC_RELEASE_ROOT__=${JSON.stringify(keyValue)}`,
], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 });
if (bundled.status !== 0) throw new Error(bundled.error?.message || bundled.stderr || 'release bootstrap bundling failed');
const block = /^INSRC_RELEASE_BOOTSTRAP_B64='[^']*'$/m;
const installer = new URL('./insrc-daemon-install.sh', import.meta.url);
const source = readFileSync(installer, 'utf8');
if (!block.test(source)) throw new Error('installer verifier marker is missing');
const packaged = source.replace(block, `INSRC_RELEASE_BOOTSTRAP_B64='${Buffer.from(bundled.stdout).toString('base64')}'`);
writeFileSync(output, packaged, { mode: 0o755 });
