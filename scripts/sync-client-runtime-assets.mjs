/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { copyFileSync, mkdirSync, rmSync, readFileSync, writeFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
/** Byte-only resource boundary; fixture callers retain the fixture publication label. */
export function copyInstallerAssets(source, destination) {
  const meta = JSON.parse(readFileSync(join(source, 'installer-assets.json'), 'utf8'));
  if (meta.schemaVersion !== 1 || !['fixture', 'qualified'].includes(meta.publication) || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(meta.scriptVersion)) throw new Error('Invalid installer asset metadata');
  const verified = [];
  for (const [name, expected] of Object.entries(meta.assets)) {
    if (!['install.sh', 'install.ps1'].includes(name) || !lstatSync(join(source, name)).isFile() || lstatSync(join(source, name)).isSymbolicLink()) throw new Error('Unexpected installer resource');
    const bytes = readFileSync(join(source, name));
    if (bytes.length !== expected.bytes || hash(bytes) !== expected.sha256) throw new Error('Installer resource digest mismatch');
    verified.push([name, bytes]);
  }
  if (!verified.length) throw new Error('Installer assets are empty');
  mkdirSync(destination, { recursive: true });
  for (const name of ['install.sh', 'install.ps1', 'installer-assets.json']) rmSync(join(destination, name), { force: true });
  for (const [name, bytes] of verified) writeFileSync(join(destination, name), bytes);
  copyFileSync(join(source, 'installer-assets.json'), join(destination, 'installer-assets.json'));
  return meta;
}
/** Shared path routing used by both real IDE packaging adapters. Byte staging
 * preserves the publication label; only syncClientRuntimeAssets admits release inputs. */
export function stageClientInstallerAssets(client, source, repositoryRoot = root) {
  if (!['vscode', 'jetbrains'].includes(client)) throw new Error('expected vscode or jetbrains');
  const destination = join(repositoryRoot, client === 'vscode' ? 'vscode-plugin/assets' : 'jetbrains-plugin/build/generated-resources/insrc');
  copyInstallerAssets(source, destination); return destination;
}
export function syncClientRuntimeAssets(client, installerDirectory) {
  if (!['vscode', 'jetbrains'].includes(client)) throw new Error('expected vscode or jetbrains');
  const destination = join(root, client === 'vscode' ? 'vscode-plugin/assets' : 'jetbrains-plugin/build/generated-resources/insrc');
  // Validate qualified inputs before changing generated resources.
  if (installerDirectory && JSON.parse(readFileSync(join(installerDirectory, 'installer-assets.json'), 'utf8')).publication !== 'qualified') throw new Error('IDE packaging requires a qualified installer release');
  mkdirSync(destination, { recursive: true });
  for (const name of ['insrc-daemon-install.sh', 'node-runtime-policy.json', 'install.sh', 'install.ps1', 'installer-assets.json']) rmSync(join(destination, name), { force: true });
  copyFileSync(join(root, 'src/prompts/steering-block.md'), join(destination, 'steering-block.md'));
  if (installerDirectory) stageClientInstallerAssets(client, installerDirectory);
}
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) syncClientRuntimeAssets(process.argv[2], process.env.INSRC_INSTALLER_ASSETS);
