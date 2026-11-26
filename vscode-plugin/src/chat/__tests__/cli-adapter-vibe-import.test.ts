/**
 * Epic unify-vibe-one-plain-cli-adapter, s1/t3: cli-adapter.ts imports VibeCatalogModel
 * from the adapter module, not the deleted app-server transport.
 *
 * Run: npx tsx --test vscode-plugin/src/chat/__tests__/cli-adapter-vibe-import.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'cli-adapter.ts'), 'utf8');

test('cli-adapter.ts imports VibeCatalogModel from the adapter module, not vibe-session.js', () => {
	assert.match(source, /import type \{ VibeCatalogModel \} from '\.\.\/\.\.\/\.\.\/src\/shared\/vibe-adapter\.js';/);
	assert.doesNotMatch(source, /vibe-session\.js/);
});
