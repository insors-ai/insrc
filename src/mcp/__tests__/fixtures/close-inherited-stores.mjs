/** Isolate process tests launched by a daemon that already holds native store descriptors.
 * Runs before application imports; stores opened by the child remain observable by lsof.
 */
import { closeSync, readdirSync, readlinkSync } from 'node:fs';

if (process.platform === 'linux') {
 for (const name of readdirSync('/proc/self/fd')) {
  const fd = Number(name);
  if (!Number.isInteger(fd) || fd <= 2) continue;
  let path;
  try { path = readlinkSync(`/proc/self/fd/${fd}`); } catch { continue; }
  if (/graph\.lmdb(-lock)?$/.test(path) || /\/\.insrc\/lance(\/|$)/.test(path)) closeSync(fd);
 }
}
