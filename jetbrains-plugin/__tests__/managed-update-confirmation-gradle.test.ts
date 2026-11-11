/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { jetbrainsPluginRoot, runFocusedJUnit } from '../test-bridge/run-focused-junit.js';

const freshness = 'ai.insors.insrc.jetbrains.freshness.DaemonFreshnessFlowTest';
const transport = 'ai.insors.insrc.jetbrains.daemon.UnixSocketDaemonRpcParseTest';
const lifecycle = 'ai.insors.insrc.jetbrains.lifecycle.DaemonLifecycleCommandRunnerTest';
const wiring = 'ai.insors.insrc.jetbrains.freshness.InstalledCommitFreshnessConsumerTest';
const classes = [freshness, transport, lifecycle, wiring];

before(() => runFocusedJUnit(classes), { timeout: 300_000 });

function requirePassingKotlinCase(className: string, name: string): void {
	const xml = readFileSync(join(jetbrainsPluginRoot, 'build', 'test-results', 'test', `TEST-${className}.xml`), 'utf8');
	const marker = `<testcase name="${name}()"`;
	const start = xml.indexOf(marker);
	assert.ok(start >= 0, `Kotlin case did not run: ${name}`);
	const next = xml.indexOf('<testcase', start + marker.length);
	assert.doesNotMatch(xml.slice(start, next < 0 ? undefined : next), /<failure|<error|<skipped/);
}

test('JetBrains selects the installer on legacy macOS and verifies the migrated commit', () => {
	requirePassingKotlinCase(lifecycle, 'legacy macOS update selects the bundled installer for the configured checkout');
	requirePassingKotlinCase(freshness, 'legacy macOS freshness verifies the bridged update without invoking old IPC');
	requirePassingKotlinCase(wiring, 'freshness routes legacy macOS through the installer and keeps managed IPC');
});

for (const name of [
	'Correlated update outcomes ignore unrelated terminal records and changed installedCommit',
	'Candidate status projects the prior commit during validation and a later rollback in both IDE confirmation flows',
	'Lost update acknowledgement does not trigger an automatic duplicate request',
]) {
	test(name, () => {
		requirePassingKotlinCase(freshness, name);
		if (name.startsWith('Lost update')) {
			requirePassingKotlinCase(transport, 'update connection loss after writing the request preserves uncertainty');
		}
	});
}
