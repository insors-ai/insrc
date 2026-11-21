/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NODE_RUNTIME_POLICY, renderNodeRuntimeShell } from './node-runtime-policy.mjs';

export function syncNodeRuntimeAssets(check = true) {
 const json = `${JSON.stringify(NODE_RUNTIME_POLICY, null, 2)}\n`;
 const outputs = [
	['scripts/node-runtime-policy.sh', renderNodeRuntimeShell()],
	['vscode-plugin/assets/node-runtime-policy.json', json],
	['jetbrains-plugin/src/main/resources/insrc/node-runtime-policy.json', json],
];
 for (const [path, content] of outputs) {
	const destination = fileURLToPath(new URL(`../${path}`, import.meta.url));
	if (check) {
		if (readFileSync(destination, 'utf8') !== content) throw new Error(`Node runtime policy asset drift: ${path}`);
	} else {
		mkdirSync(dirname(destination), { recursive: true });
		writeFileSync(destination, content);
	}
 }
 // These standalone signed-release scripts deliberately retain their existing
 // formats and dependency closure. A release pin change must update them explicitly.
 for (const path of ['scripts/daemon-bundle-metadata.mjs', 'scripts/daemon-development-metadata.mjs',
  'scripts/linux-daemon-metadata.mjs', 'scripts/package-daemon-candidate.mjs',
  'scripts/package-daemon-bootstrap.mjs', 'scripts/install-daemon-bundle.mjs']) {
  const source = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
  const pins = [...source.matchAll(/(?:nodeVersion\s*[!=]==|process\.versions\.node\s*[!=]==|\b(?:NODE_VERSION|DEVELOPMENT_NODE_VERSION|LINUX_NODE_VERSION)\s*=)\s*'([0-9]+\.[0-9]+\.[0-9]+)'/g)];
  if (pins.length === 0 || pins.some(match => match[1] !== NODE_RUNTIME_POLICY.nodeVersion)) {
   throw new Error(`Node runtime release pin drift: ${path}`);
  }
 }
 const npmrc = readFileSync(new URL('../.npmrc', import.meta.url), 'utf8');
 if (!npmrc.split('\n').includes(`target="${NODE_RUNTIME_POLICY.nodeVersion}"`)) throw new Error('Node native header pin drift: .npmrc');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
 const args = process.argv.slice(2);
 if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) throw new Error('usage: sync-node-runtime-policy.mjs [--check]');
 syncNodeRuntimeAssets(args[0] === '--check');
}
