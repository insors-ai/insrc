import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** A recording runtime authority for tests of sync/stop behavior, not bootstrap
 * qualification. Native archive and owned-selection integration run separately. */
export function controlRuntimeFixture(sourceScript: string, folder: string): string {
	mkdirSync(folder, { recursive: true });
	const script = join(folder, 'daemon-ctl.sh'); copyFileSync(sourceScript, script);
	const quote = (value: string) => "'" + value.replaceAll("'", "'\\''") + "'";
	writeFileSync(join(folder, 'node-runtime-env.sh'), `insrc_source_toolchain() {
  NODE_BIN=${quote(process.execPath)}
  NPM_CLI=/unused-fixture-npm
  TOOLCHAIN_ID=recording-runtime-authority
  unset NODE_OPTIONS NODE_PATH
}\n`);
	return script;
}
