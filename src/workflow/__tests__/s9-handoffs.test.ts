import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(ROOT, 'src');

/** The stamps the common model removed. A production file outside the conversion that names one is reading or writing a head the old way. */
const REMOVED = [
	/\bmeta\??\.(?:approvedAt|rejectedAt|staleAckedAt|reviewOverride|reviewResolutions|rejectReason|review)\b/,
	/\bmeta\??\[['"](?:approvedAt|rejectedAt|staleAckedAt|reviewOverride|reviewResolutions|rejectReason|review)['"]\]/,
	/\bbody\??\.feedback\b/,
	/\bartifact_feedback_append\b/,
	/\bfeedbackBodyLines\b/,
	/\bwithPriorFeedback\b/,
];

function productionFiles(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) {
			if (name === '__tests__' || name === 'convert' || name === 'node_modules') continue;
			productionFiles(p, out);
		} else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) out.push(p);
	}
	return out;
}

test('s9-handoffs.test.ts: the plans document names each s9 hand-off and no production file outside the conversion names a removed stamp', () => {
	const doc = readFileSync(join(ROOT, 'docs', 'plans', 'core-data-model.md'), 'utf8');
	const at = doc.indexOf('## s9 build: hand-offs');
	assert.ok(at >= 0, 'the section exists');
	const rest = doc.slice(at + 1);
	const next = rest.indexOf('\n## ');
	const section = next < 0 ? rest : rest.slice(0, next);
	const items = section.split('\n').filter(l => /^[1-9]\. \*\*/.test(l));
	assert.equal(items.length, 3, 'three numbered items');
	const expect: ReadonlyArray<readonly [RegExp, ReadonlyArray<RegExp>]> = [
		[/conversion is run by hand after the BUILD is approved/, [/restarted daemon/, /`repo\.convert`/, /`mode: 'apply'`/]],
		[/Pre-s8 attach comments are listed, never rewritten/, [/`isFrameworkComment`/, /`legacyAttachComments`/, /<!-- insrc:attach:<artifact id> -->/]],
		[/first sync of a bound unit posts the feedback converted/, [/`postOutbound`/, /`feedback-post` receipt/, /cut-over/]],
	];
	expect.forEach(([title, parts], i) => {
		assert.match(items[i] ?? '', title);
		for (const part of parts) assert.match(items[i] ?? '', part);
	});

	const hits: string[] = [];
	for (const file of productionFiles(SRC)) {
		const lines = readFileSync(file, 'utf8').split('\n');
		lines.forEach((line, i) => { if (REMOVED.some(re => re.test(line))) hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim().slice(0, 100)}`); });
	}
	assert.deepEqual(hits, [], 'a removed stamp is named outside the conversion');
	assert.equal(existsSync(join(SRC, 'workflow', 'artifacts', 'provenance', 'writer.ts')), false, 'the body feedback writer is gone');
});
