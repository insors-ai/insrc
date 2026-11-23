/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { copyFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const client = process.argv[2];
if (!['vscode', 'jetbrains'].includes(client)) throw new Error('expected vscode or jetbrains');
const destination = join(root, client === 'vscode' ? 'vscode-plugin/assets' : 'jetbrains-plugin/build/generated-resources/insrc');
mkdirSync(destination, { recursive: true });
// Retire stale generated installer resources from an earlier build as well.
for (const name of ['insrc-daemon-install.sh', 'node-runtime-policy.json']) {
  rmSync(join(destination, name), { force: true });
}
copyFileSync(join(root, 'src/prompts/steering-block.md'), join(destination, 'steering-block.md'));
