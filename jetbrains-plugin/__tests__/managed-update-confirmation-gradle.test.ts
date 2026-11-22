/* Copyright (c) Procix Software India. Licensed under the MIT License. */

import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { before, test } from 'node:test';
import { runFocusedJUnit } from '../test-bridge/run-focused-junit.js';

const freshness = 'ai.insors.insrc.jetbrains.freshness.DaemonFreshnessFlowTest';
const transport = 'ai.insors.insrc.jetbrains.daemon.UnixSocketDaemonRpcParseTest';
const lifecycle = 'ai.insors.insrc.jetbrains.lifecycle.DaemonLifecycleCommandRunnerTest';
const wiring = 'ai.insors.insrc.jetbrains.freshness.InstalledCommitFreshnessConsumerTest';
const classes = [freshness, transport, lifecycle, wiring];

const reports = new Map<string, string>();
before(() => runFocusedJUnit(classes, process.env, directory => {
 for (const cls of classes) reports.set(cls, readFileSync(join(directory, `TEST-${cls}.xml`), 'utf8'));
}), { timeout: 300_000 });

function requirePassingKotlinCase(className: string, name: string): void {
	const xml = reports.get(className)!;
	const marker = `<testcase name="${name}()"`;
	const start = xml.indexOf(marker);
	assert.ok(start >= 0, `Kotlin case did not run: ${name}`);
	const next = xml.indexOf('<testcase', start + marker.length);
	assert.doesNotMatch(xml.slice(start, next < 0 ? undefined : next), /<failure|<error|<skipped/);
}

test('JetBrains selects the current installer and verifies the resulting commit', () => {
	for (const xml of reports.values()) assert.doesNotMatch(xml, /<failure|<error|<skipped/);
	requirePassingKotlinCase(lifecycle, 'updates require the current bundled installer even with an old controller present');
	requirePassingKotlinCase(freshness, 'legacy macOS freshness verifies the bridged update without invoking old IPC');
	requirePassingKotlinCase(wiring, 'freshness uses the current installer bridge while retaining IPC status and outcomes');
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
