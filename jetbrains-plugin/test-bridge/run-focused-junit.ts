/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { strict as assert } from 'node:assert';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const jetbrainsPluginRoot = fileURLToPath(new URL('../', import.meta.url));

export function runFocusedJUnit(classes: readonly string[], env = process.env): void {
	const scratch = mkdtempSync(join(tmpdir(), 'insrc-focused-junit-'));
	try {
		// Gradle's --tests selects execution only. Compile the same focused sources.
		const init = join(scratch, 'focused.gradle');
		writeFileSync(init, `
gradle.beforeProject { project ->
    project.plugins.withId('org.jetbrains.kotlin.jvm') {
        project.kotlin.sourceSets.getByName('test').kotlin.setIncludes([${classes.map(name => `'${name.replaceAll('.', '/')}.kt'`).join(', ')}])
    }
}
`);
		const result = spawnSync('./gradlew', [
			'-I', init, '--no-configuration-cache', '--no-build-cache', '--offline',
			`-PinsrcFixtureReports=${join(scratch, 'reports')}`, 'test', '--rerun',
			...classes.flatMap(name => ['--tests', name]), '--console=plain',
		], { cwd: jetbrainsPluginRoot, env, encoding: 'utf8', timeout: 290_000 });
		assert.equal(result.status, 0, `Gradle focused tests failed:\n${result.error ?? ''}\n${result.stdout}\n${result.stderr}`);
	} finally { rmSync(scratch, { recursive: true, force: true }); }
}
