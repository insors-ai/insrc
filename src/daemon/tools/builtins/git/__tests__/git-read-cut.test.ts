/**
 * git_rev_parse and git_hash_object fail on a cut capture instead of reading the cut text
 * (the add-optional-output-budget-git-ls Story, ac6).
 * Run: npx tsx --test-force-exit src/daemon/tools/builtins/git/__tests__/git-read-cut.test.ts
 */

import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';

import { cleanup } from '../../../__tests__/_proc.js';
import { gitHashObjectTool } from '../hash-object.js';
import { gitRevParseTool } from '../rev-parse.js';
import { toolDeps } from './_repo.js';
import { installStandInGit } from './_standin.js';
import type { StandIn } from './_standin.js';

const T = 'src/daemon/tools/builtins/git/__tests__/git-read-cut.test.ts';
const MiB = 1024 * 1024;
const SHA = 'a'.repeat(40);

let standIn: StandIn | undefined;
afterEach(() => { standIn?.restore(); if (standIn) cleanup(standIn.dir); standIn = undefined; });
const install = (body: string): void => { standIn?.restore(); if (standIn) cleanup(standIn.dir); standIn = installStandInGit(body); };
const revParse = (input: Record<string, unknown> = {}) => gitRevParseTool.execute({ cwd: '/tmp', ...input }, toolDeps('/tmp'));
const hashObject = () => gitHashObjectTool.execute({ cwd: '/tmp', path: 'x' }, toolDeps('/tmp'));

test(`${T}: git_rev_parse and git_hash_object return a rejected failure that says the output was cut and no data when the capture is cut (for git_hash_object also when the retained text is a valid object name followed by output that overflowed), and return the same results as before for output that fits`, async () => {
	const CUT = /cut at the byte limit/;
	// git_rev_parse: more lines than the capture holds is a failure, not a list of the lines that were kept
	install(`yes '${SHA}' | head -c ${11 * MiB}`);
	const cutRev = await revParse({ rev: 'HEAD' });
	assert.equal(cutRev.success, false);
	assert.equal(cutRev.failure?.kind, 'rejected');
	assert.match(cutRev.error ?? '', CUT);
	assert.equal(cutRev.data, undefined);
	// git_hash_object: output that is not an object name and is cut
	install(`yes '${SHA}' | head -c ${11 * MiB}`);
	const cutHash = await hashObject();
	assert.equal(cutHash.success, false);
	assert.match(cutHash.error ?? '', CUT);
	assert.equal(cutHash.data, undefined);
	// git_hash_object: a valid object name followed by output that overflows. Trimmed, the kept text is the name, so the
	// old code returned it as a success; the cut is now the failure
	install(`printf '${SHA}\\n'; head -c ${11 * MiB} /dev/zero | tr '\\000' '\\n'`);
	const valid = await hashObject();
	assert.equal(valid.success, false, 'a valid retained name followed by dropped output is not accepted');
	assert.match(valid.error ?? '', CUT);
	assert.equal(valid.data, undefined);
	// output that fits: the same results as before
	install(`echo '${SHA}'`);
	const ok = await hashObject();
	assert.equal(ok.success, true);
	assert.deepEqual(ok.data, { sha: SHA });
	install(`printf 'abc\\ndef\\n\\n'`);
	const okRev = await revParse({ rev: 'HEAD' });
	assert.equal(okRev.success, true);
	assert.deepEqual(okRev.data, { values: ['abc', 'def'] });
	install('printf ""');
	const none = await revParse({ rev: 'HEAD' });
	assert.equal(none.success, true);
	assert.deepEqual(none.data, { values: [] });
	install(`echo 'not a name'`);
	const notName = await hashObject();
	assert.equal(notName.success, false);
	assert.match(notName.error ?? '', /git printed no object name/, 'the object-name check still applies to uncut output');
});
