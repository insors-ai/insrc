/**
 * Test preload (`node --import`): replaces keytar's functions below everything the daemon runs, so a
 * spawned daemon never reaches the real Keychain and no production switch is needed. The store persists
 * across daemon restarts. Every call is appended to calls.log; a `refuse` file makes every call reject.
 *
 * It also stands in for the shutdown watchdog helper, which needs a kernel capability a test daemon is
 * not granted (the broker is refused on macOS). Without one the daemon fails closed by SIGKILL before it
 * closes anything; with this answer the rest of the real shutdown sequence runs.
 */
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { join } from 'node:path';
import keytar from 'keytar';

const dir = process.env['INSRC_TEST_KEYTAR_DIR'];
if (dir === undefined) throw new Error('INSRC_TEST_KEYTAR_DIR is required');
const storePath = join(dir, 'store.json');
const read = (): Record<string, string> => existsSync(storePath) ? JSON.parse(readFileSync(storePath, 'utf8')) as Record<string, string> : {};
function enter(call: string): void {
	appendFileSync(join(dir!, 'calls.log'), `${call}\n`);
	if (existsSync(join(dir!, 'refuse'))) throw new Error('The user denied access.');
}
Object.assign(keytar, {
	getPassword: async (service: string, account: string) => { enter(`get ${service} ${account}`); return read()[`${service}/${account}`] ?? null; },
	setPassword: async (service: string, account: string, value: string) => { enter(`set ${service} ${account}`); writeFileSync(storePath, JSON.stringify({ ...read(), [`${service}/${account}`]: value })); },
	deletePassword: async (service: string, account: string) => {
		enter(`delete ${service} ${account}`);
		const { [`${service}/${account}`]: removed, ...rest } = read();
		writeFileSync(storePath, JSON.stringify(rest));
		return removed !== undefined;
	},
	findCredentials: async (service: string) => { enter(`find ${service}`); return []; },
});

const realFork = childProcess.fork;
childProcess.fork = ((...args: Parameters<typeof realFork>) => {
	if (!String(args[0]).includes('insrc-shutdown-watchdog')) return realFork(...args);
	const helper = Object.assign(new EventEmitter(), { pid: 2 ** 22 + 1, connected: false, unref() {}, kill() { return true; } });
	setImmediate(() => helper.emit('message', { type: 'ready', pid: helper.pid }));
	return helper;
}) as typeof realFork;
syncBuiltinESMExports();
