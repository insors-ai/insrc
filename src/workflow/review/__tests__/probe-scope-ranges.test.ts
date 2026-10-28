import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { gatherEvidence } from '../probe.js';
import { buildExtractPrompt, normalizeClaimsEnvelope, EXTRACT_SCHEMA } from '../extract.js';
import { buildVerifyPrompt } from '../verify.js';
import { designReviewSnapshot, premiseAdapter } from '../../review-pipeline/design-review.js';
import { validateAgainstSchema } from '../../../agent/providers/structured-output.js';
import type { Claim } from '../types.js';

const noEntities = async () => [];
function fixture() {
	const repo = mkdtempSync(join(tmpdir(), 'insrc-probe-fix-'));
	mkdirSync(join(repo, 'src')); mkdirSync(join(repo, 'docs'));
	writeFileSync(join(repo, 'src/code.ts'), 'first\nsecond\nthird\nfourth');
	writeFileSync(join(repo, 'docs/current.md'), '# Current\n| k1 |\n| k2 |\nDepends on: s1\n');
	// Enough unrelated matches to consume the entire old global cap.
	writeFileSync(join(repo, 'docs/aaa-other.md'), Array.from({length: 80}, () => '| k9 |\nDepends on: unrelated').join('\n'));
	return { repo, cleanup: () => rmSync(repo, {recursive: true, force: true}) };
}
const claim = (probe: Claim['probe'], kind: Claim['kind'] = 'citation'): Claim => ({id:'c1',kind,text:'A fixture premise',anchors:[],probe});

test('review reads inclusive ranges and preserves single-line and column anchors', async () => {
	const f=fixture();try {
		const [ev]=await gatherEvidence([claim({reads:['src/code.ts:2-4','src/code.ts:2','src/code.ts:2:3']})], f.repo, {readEntitiesForRepo:noEntities});
		assert.deepEqual(ev!.reads[0], {anchor:'src/code.ts:2-4',found:true,line:'second\nthird\nfourth',lineStart:2,lineEnd:4});
		assert.equal(ev!.reads[1]!.line,'second');assert.equal(ev!.reads[2]!.line,'second');
	} finally {f.cleanup();}
});

test('review read errors distinguish invalid anchors, absent files, bad bounds and escapes', async () => {
	const f=fixture();try {
		const reads=['src/code.ts:4-2','src/code.ts:0','src/code.ts:2:0','src/code.ts:9007199254740992','src/code.ts','src/missing.ts:1','src/code.ts:3-9','../outside.ts:1'];
		const [ev]=await gatherEvidence([claim({reads})],f.repo,{readEntitiesForRepo:noEntities});
		assert.deepEqual(ev!.reads.map(r=>r.error),['invalid-anchor','invalid-anchor','invalid-anchor','invalid-anchor','invalid-anchor','missing-file','out-of-range','forbidden-path']);
		assert.ok(ev!.reads.every(r=>!r.found));
		const prompt=buildVerifyPrompt(claim({reads}),ev!).user;
		assert.match(prompt,/EVIDENCE ERROR: invalid-anchor/);assert.match(prompt,/not proof of a missing file/);
		assert.match(prompt,/NOT FOUND \[missing-file\]/);
	} finally {f.cleanup();}
});

test('review range evidence is bounded and marks incomplete lines or text explicitly', async () => {
	const f=fixture();try {
		writeFileSync(join(f.repo,'src/many.ts'),Array.from({length:400},(_,i)=>`line${i+1}`).join('\n'));
		writeFileSync(join(f.repo,'src/long.ts'),'x'.repeat(20_000));
		writeFileSync(join(f.repo,'src/huge.ts'),'x'.repeat(2*1024*1024+1));
		const [ev]=await gatherEvidence([claim({reads:['src/many.ts:1-400','src/long.ts:1','src/huge.ts:1']})],f.repo,{readEntitiesForRepo:noEntities});
		assert.equal(ev!.reads[0]!.truncated,true);assert.equal(ev!.reads[0]!.lineEnd,200);assert.equal(ev!.reads[0]!.line!.split('\n').length,200);
		assert.equal(ev!.reads[1]!.truncated,true);assert.equal(ev!.reads[1]!.line!.length,16_000);
		assert.equal(ev!.reads[2]!.error,'file-too-large');
		assert.match(buildVerifyPrompt(claim({}),ev!).user,/TRUNCATED; requested evidence is incomplete/);
	} finally {f.cleanup();}
});

test('review reads and scoped searches refuse symlink escapes', async () => {
	const f=fixture();const outside=mkdtempSync(join(tmpdir(),'insrc-probe-outside-'));try {
		writeFileSync(join(outside,'secret.ts'),'private');symlinkSync(join(outside,'secret.ts'),join(f.repo,'src/link.ts'));
		const [ev]=await gatherEvidence([claim({reads:['src/link.ts:1'],greps:['private'],grepFiles:['src/link.ts']})],f.repo,{readEntitiesForRepo:noEntities});
		assert.equal(ev!.reads[0]!.error,'forbidden-path');assert.equal(ev!.grepResults[0]!.error,'forbidden-scope');
		assert.deepEqual(ev!.grepResults[0]!.matches,[]);assert.equal(ev!.reads[0]!.line,undefined);
	} finally {f.cleanup();rmSync(outside,{recursive:true,force:true});}
});

test('artifact-scoped inventory and ordering do not consume unrelated epic matches', async () => {
	const f=fixture();try {
		const claims=[claim({greps:['\\| k[0-9] \\|'],grepScope:'artifact'},'inventory'), {...claim({greps:['Depends on:'],grepScope:'artifact'},'ordering'),id:'c2'}];
		const ev=await gatherEvidence(claims,f.repo,{readEntitiesForRepo:noEntities,artifactPath:'docs/current.md'});
		assert.equal(ev[0]!.grepResults[0]!.matches.length,2);assert.equal(ev[1]!.grepResults[0]!.matches.length,1);
		assert.ok(ev.every(e=>e.grepResults.every(g=>!g.truncated && g.matches.every(m=>m.startsWith('docs/current.md:')))));
		assert.match(buildVerifyPrompt(claim({}),ev[0]!).user,/scope: docs\/current.md/);
	} finally {f.cleanup();}
});

test('artifact searches use frozen amended text and explicit file searches retain source-wide intent', async () => {
	const f=fixture();try {
		const ev=await gatherEvidence([claim({greps:['Depends on:'],grepScope:'artifact'},'ordering'),{...claim({greps:['third'],grepFiles:['src/code.ts']}),id:'c2'}],f.repo,{readEntitiesForRepo:noEntities,artifactPath:'docs/current.md',artifactText:'Depends on: amended\nDepends on: frozen'});
		assert.equal(ev[0]!.grepResults[0]!.matches.length,2);assert.ok(ev[0]!.grepResults[0]!.matches.some(m=>m.includes('amended')));
		assert.deepEqual(ev[1]!.grepResults[0]!.matches,['src/code.ts:3:third']);
		const [legacy]=await gatherEvidence([claim({greps:['first']})],f.repo,{readEntitiesForRepo:noEntities});
		assert.ok(legacy!.grepResults[0]!.matches.some(m=>m.includes('src/code.ts:1:first')));
	} finally {f.cleanup();}
});

test('invalid or missing probe scopes never widen to the whole repository', async () => {
	const f=fixture();try {
		const cases=[claim({greps:['k9']},'inventory'),claim({greps:['k9'],grepScope:'artifact',grepFiles:['src/code.ts']}),claim({greps:['k9'],grepFiles:[]}),claim({greps:['k9'],grepFiles:['../escape.md']}),claim({greps:['k9'],grepFiles:['docs/missing.md']}),claim({greps:['['],grepScope:'artifact'})];
		const ev=await gatherEvidence(cases,f.repo,{readEntitiesForRepo:noEntities,artifactPath:'docs/current.md'});
		assert.deepEqual(ev.map(e=>e.grepResults[0]!.error),['scope-required','invalid-scope','invalid-scope','forbidden-scope','scope-unreadable','invalid-pattern']);
		assert.ok(ev.every(e=>e.grepResults[0]!.matches.length===0));
		const [noArtifact]=await gatherEvidence([claim({greps:['k9'],grepScope:'artifact'})],f.repo,{readEntitiesForRepo:noEntities});
		assert.equal(noArtifact!.grepResults[0]!.error,'invalid-scope');
	} finally {f.cleanup();}
});

test('scoped probes mark capped matches and oversized scope evidence as incomplete', async () => {
	const f=fixture();try {
		const [ev]=await gatherEvidence([claim({greps:['Depends on:'],grepFiles:['docs/aaa-other.md']})],f.repo,{readEntitiesForRepo:noEntities});
		assert.equal(ev!.grepResults[0]!.matches.length,50);assert.equal(ev!.grepResults[0]!.truncated,true);
	} finally {f.cleanup();}
});

test('extraction schema and normalization carry scope through the saved pipeline probe stage', async () => {
	const f=fixture();try {
		const claims=[claim({greps:['Depends on:'],grepScope:'artifact',reads:['src/code.ts:1-2']},'ordering')];
		assert.equal(validateAgainstSchema(EXTRACT_SCHEMA,{claims}).ok,true);
		assert.deepEqual(normalizeClaimsEnvelope({claims})[0]!.probe,claims[0]!.probe);
		const snapshot=designReviewSnapshot('Depends on: frozen',join(f.repo,'docs/current.md'));
		const adapter=premiseAdapter(snapshot,{stage:'define',repo:f.repo,readEntitiesForRepo:noEntities});
		for (const path of ['daemon', 'controller'] as const) {
			const stages = adapter.stagesFor(path);
			const extract = stages.find(s => s.id === 'extract')!;
			assert.match(JSON.stringify(extract.singleCalls({}, snapshot)), /Reviewed artifact path/);
			const storedClaims = JSON.parse(JSON.stringify(extract.toSnapshot!([{callId:'x',answer:{claims}}])));
			const evidence = await stages.find(s => s.id === 'probe')!.run!({}, {...snapshot,claims:storedClaims});
			assert.match(JSON.stringify(evidence), /Depends on: frozen/);
			assert.doesNotMatch(JSON.stringify(evidence), /unrelated/);
		}
		assert.match(buildExtractPrompt('doc','define').system,/Never use a repository-wide Depends on/);
	} finally {f.cleanup();}
});
