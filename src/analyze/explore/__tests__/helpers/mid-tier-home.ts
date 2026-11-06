/**
 * Import FIRST in a test file: points HOME at a temporary directory whose
 * ~/.insrc/config.json names a CLI mid tier, before any module reads its paths
 * or the analyze config, so the document-relations switch is computed from a
 * known model rather than this machine's config (Epic c2ba6fa6 s10 tests).
 */

import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const TEMP_HOME = mkdtempSync(join(tmpdir(), 'insrc-s10-home-'));
mkdirSync(join(TEMP_HOME, '.insrc'), { recursive: true });
writeFileSync(join(TEMP_HOME, '.insrc', 'config.json'), JSON.stringify({ models: { tiers: {
	core:  { runner: 'cli-codex',  model: 'gpt-6.1-sol' },
	mid:   { runner: 'cli-claude', model: 'sonnet' },
	cheap: { runner: 'cli-claude', model: 'haiku' },
} } }));
process.env['HOME'] = TEMP_HOME;
