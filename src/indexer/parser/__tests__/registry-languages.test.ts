/**
 * Epic c2ba6fa6, Story s9, t2 -- a reader whose grammar cannot load is
 * skipped with its reason, and the daemon lists the languages the index
 * reads. The guarded load: a load that throws registers nothing, is recorded
 * unavailable with the error, and a reader loaded after it still registers.
 * The 'index.languages' request (the real handler runtime, in process, with
 * the indexer's readers loaded) lists python, go, typescript, javascript,
 * java, scala and kotlin available, and is classed for the code-indexing
 * worker that holds the registry.
 *
 * Run: npx tsx --test src/indexer/parser/__tests__/registry-languages.test.ts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const HOME = mkdtempSync(join(tmpdir(), 'insrc-registry-languages-'));
mkdirSync(join(HOME, '.insrc'), { recursive: true });
process.env['HOME'] = HOME;
await import('../../index.js');   // the indexer's readers register on import
const { getParser, listReaders, loadReader } = await import('../registry.js');
const { languageOfExtension } = await import('../../resolver.js');
const { buildHandlerRuntime } = await import('../../../daemon/handler-runtime.js');
const { methodClasses } = await import('../../../daemon/threads/method-class.js');
type CodeParser = import('../base.js').CodeParser;

test.after(() => { rmSync(HOME, { recursive: true, force: true }); });

function untouchable(name: string): never {
	return new Proxy({}, { get: (_t, prop) => { throw new Error(`the request read ${name}.${String(prop)}`); } }) as never;
}

test('s9 t2: a reader whose grammar load throws is not registered and is listed unavailable with the error; a reader loaded after it still registers', () => {
	const failed = loadReader('proto', ['.probe-proto'], () => { throw new Error("Cannot find module 'tree-sitter-probe'"); });
	assert.equal(failed, null);
	assert.equal(getParser('/x/a.probe-proto'), null, 'its files are not read');

	const stand = { extensions: ['.probe-ok'], language: 'csharp', parse: () => ({ entities: [], relations: [] }) } as unknown as CodeParser;
	assert.equal(loadReader('csharp', ['.probe-ok'], () => stand), stand);
	assert.equal(getParser('/x/a.probe-ok'), stand, 'the next reader registers');

	// A language no reader reads (rust, the first probe, has a reader since t6).
	const proto = listReaders(languageOfExtension).find(r => r.language === 'proto');
	assert.deepEqual(proto, { language: 'proto', extensions: ['.probe-proto'], available: false, reason: "Cannot find module 'tree-sitter-probe'" });
});

test('s9 t2: the index.languages request lists python, go, typescript, javascript, java, scala and kotlin available, with their extensions; it is classed for the code-indexing worker', async () => {
	assert.equal(methodClasses.classOf('index.languages'), 'indexing');
	const runtime = buildHandlerRuntime({
		db: untouchable('db'), configStore: untouchable('configStore'), queue: untouchable('queue'), indexer: untouchable('indexer'),
		startedAt: 0, shutdown: () => { throw new Error('shutdown called'); }, attachedClients: () => [], understandingService: () => undefined,
	});
	try {
		const { languages } = await runtime.rpcHandlers['index.languages']!({}) as { languages: Array<{ language: string; extensions: string[]; available: boolean }> };
		const by = new Map(languages.map(l => [l.language, l]));
		for (const lang of ['python', 'go', 'typescript', 'javascript', 'java', 'scala', 'kotlin']) {
			assert.equal(by.get(lang)?.available, true, `${lang} is read`);
		}
		assert.ok(by.get('typescript')!.extensions.includes('.ts'));
		assert.ok(by.get('javascript')!.extensions.includes('.js'), 'the TypeScript reader is listed per language');
		assert.ok(by.get('kotlin')!.extensions.includes('.kt'));
		assert.equal(by.has('config'), false, 'documents and config files are not listed as languages');
	} finally {
		runtime.understandingRoutes.stop();
	}
});
