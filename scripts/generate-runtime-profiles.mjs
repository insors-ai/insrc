/** Maintainer-only, offline metadata derivation. Reads pinned official assets;
 * never extracts to disk, spawns a process, runs target code or qualifies it.
 * Node22: node --import tsx scripts/generate-runtime-profiles.mjs --check|--write <asset-directory>
 */
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { inventoryFor, sha256 } from './installer-payload.mjs';
import { RUNTIME_PROFILE_VERSION, RUNTIME_LIMITS, runtimeInventoryJson } from '../src/installer/runtime-metadata.ts';
const require = createRequire(import.meta.url);
// Existing installed dependencies. This maintenance tool is not shipped.
const tar = require('tar'), yauzl = require('yauzl');
const policyFile = fileURLToPath(new URL('../src/installer/runtime-policy.json', import.meta.url));
const policy = JSON.parse(readFileSync(policyFile, 'utf8'));

function verified(file, hash, expectedBytes) {
  const size = statSync(file).size;
  if (size < 1 || size > RUNTIME_LIMITS.compressedBytes || (expectedBytes !== undefined && size !== expectedBytes)) throw Error('Runtime asset size mismatch');
  const bytes = readFileSync(file);
  if (bytes.length !== size || sha256(bytes) !== hash) throw Error('Official runtime asset digest mismatch');
  return bytes;
}
function put(files, path, bytes, mode) {
  if (files.has(path) || files.size >= RUNTIME_LIMITS.entries || bytes.length > RUNTIME_LIMITS.entryBytes) throw Error('Runtime profile entry conflict or bound');
  files.set(path, { bytes, mode });
}
function selected(name, windows) {
  return name === (windows ? 'node.exe' : 'bin/node') || name === 'LICENSE'
    || name.startsWith(windows ? 'node_modules/npm/' : 'lib/node_modules/npm/') || name.startsWith('include/node/');
}
async function tarFiles(bytes, root, select, files) {
  let failure, entries = 0, expanded = 0;
  const parser = tar.t({ strict: true, onReadEntry(entry) {
    if (++entries > 65_536) { failure ??= Error('Runtime archive entry bound'); entry.resume(); return; }
    if (!entry.path.startsWith(root + '/')) { entry.resume(); return; }
    const path = entry.path.slice(root.length + 1);
    if (!select(path) || entry.type === 'Directory') { entry.resume(); return; }
    if (entry.type !== 'File' || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > RUNTIME_LIMITS.entryBytes) {
      failure ??= Error('Unsupported runtime profile entry'); entry.resume(); return;
    }
    expanded += entry.size;
    if (expanded > RUNTIME_LIMITS.expandedBytes) { failure ??= Error('Runtime expanded bound'); entry.resume(); return; }
    const chunks = []; let count = 0;
    entry.on('data', chunk => { count += chunk.length; if (count <= entry.size) chunks.push(chunk); else failure ??= Error('Runtime entry grew'); });
    entry.on('end', () => {
      if (failure) return;
      try { if (count !== entry.size) throw Error('Runtime entry size mismatch'); put(files, path, Buffer.concat(chunks), entry.mode & 0o111 ? 0o755 : 0o644); }
      catch (error) { failure = error; }
    });
  } });
  const ended = once(parser, 'end'); parser.end(bytes); await ended;
  if (failure) throw failure;
}
async function zipFiles(bytes, root, files) {
  const zip = await new Promise((resolve, reject) => yauzl.fromBuffer(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => error ? reject(error) : resolve(zip)));
  let entries = 0, expanded = 0;
  try {
    await new Promise((resolve, reject) => {
      zip.on('error', reject); zip.on('end', resolve);
      zip.on('entry', entry => {
        void (async () => {
          if (++entries > 65_536) throw Error('Runtime archive entry bound');
          if (!entry.fileName.startsWith(root + '/')) { zip.readEntry(); return; }
          const path = entry.fileName.slice(root.length + 1);
          if (!selected(path, true) || path.endsWith('/')) { zip.readEntry(); return; }
          const type = (entry.externalFileAttributes >>> 16) & 0o170000;
          if ((type && type !== 0o100000) || entry.uncompressedSize > RUNTIME_LIMITS.entryBytes) throw Error('Unsupported runtime ZIP entry');
          expanded += entry.uncompressedSize; if (expanded > RUNTIME_LIMITS.expandedBytes) throw Error('Runtime expanded bound');
          const stream = await new Promise((resolve, reject) => zip.openReadStream(entry, (error, stream) => error ? reject(error) : resolve(stream)));
          const chunks = []; let count = 0;
          for await (const chunk of stream) { count += chunk.length; if (count > entry.uncompressedSize) throw Error('Runtime ZIP entry grew'); chunks.push(chunk); }
          if (count !== entry.uncompressedSize) throw Error('Runtime ZIP size mismatch');
          put(files, path, Buffer.concat(chunks), path === 'node.exe' ? 0o755 : 0o644); zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
  } finally { zip.close(); }
}
/** Deterministic byte profile; independent from store completion receipts. */
export async function deriveRuntimeProfile(target, assetDirectory) {
  if (!Object.hasOwn(policy.archives, target)) throw Error('Unsupported runtime target');
  const windows = target.startsWith('win32-'), arch = target.slice(target.lastIndexOf('-') + 1);
  const root = `node-v${policy.nodeVersion}-${target.replace('win32-', 'win-')}`;
  const name = root + (windows ? '.zip' : '.tar.gz');
  const archive = verified(join(assetDirectory, name), policy.archives[target]), files = new Map();
  if (windows) {
    await zipFiles(archive, root, files);
    const header = policy.supplemental.headers, library = policy.supplemental.libraries[arch];
    await tarFiles(verified(join(assetDirectory, `node-v${policy.nodeVersion}-headers.tar.gz`), header.sha256, header.bytes), `node-v${policy.nodeVersion}`, path => path.startsWith('include/node/'), files);
    put(files, `${arch}/node.lib`, verified(join(assetDirectory, `win-${arch}`, 'node.lib'), library.sha256, library.bytes), 0o644);
  } else await tarFiles(archive, root, path => selected(path, false), files);
  const npm = files.get(windows ? 'node_modules/npm/package.json' : 'lib/node_modules/npm/package.json');
  const header = files.get('include/node/node_version.h'), node = files.get(windows ? 'node.exe' : 'bin/node');
  if (!node || !npm || !header || JSON.parse(npm.bytes.toString('utf8')).version !== policy.npmVersion) throw Error('Runtime node/npm metadata mismatch');
  const version = ['MAJOR', 'MINOR', 'PATCH'].map(key => new RegExp(`^#define NODE_${key}_VERSION\\s+(\\d+)`, 'm').exec(header.bytes.toString('utf8'))?.[1]).join('.');
  if (version !== policy.headersVersion || policy.nodeVersion !== policy.headersVersion) throw Error('Runtime header policy mismatch');
  for (const path of ['include/node/node_api.h', 'include/node/common.gypi', 'include/node/config.gypi']) if (!files.has(path)) throw Error('Runtime header missing');
  const inventory = inventoryFor(files);
  const inventoryBytes = runtimeInventoryJson(inventory), expandedBytes = inventory.reduce((sum, f) => sum + f.bytes, 0);
  if (Buffer.byteLength(inventoryBytes) > RUNTIME_LIMITS.inventoryBytes || expandedBytes > RUNTIME_LIMITS.expandedBytes) throw Error('Runtime profile bounds exceeded');
  return { profileVersion: RUNTIME_PROFILE_VERSION, archiveBytes: archive.length, nodeSha256: sha256(node.bytes), inventorySha256: sha256(inventoryBytes), entries: inventory.length, expandedBytes };
}
export async function deriveRuntimeProfiles(assetDirectory) {
  const profiles = {};
  for (const target of Object.keys(policy.archives)) profiles[target] = await deriveRuntimeProfile(target, assetDirectory);
  return profiles;
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const [mode, directory, ...extra] = process.argv.slice(2);
  if (!['--check', '--write'].includes(mode) || !directory || extra.length) throw Error('Usage: --check|--write <official-asset-directory>');
  const profiles = await deriveRuntimeProfiles(resolve(directory));
  if (mode === '--check') {
    if (JSON.stringify(profiles) !== JSON.stringify(policy.profiles)) throw Error('Pinned runtime profile metadata differs');
    process.stdout.write('All six official runtime profiles reproduced; no target binaries executed.\n');
  } else writeFileSync(policyFile, JSON.stringify({ ...policy, profiles }, null, 2) + '\n');
}
