/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { QUALIFICATION_TESTS, readBundleManifest, readQualification, sha256 } from './daemon-bundle-metadata.mjs';
import { readBoundedRegular } from './verify-daemon-bundle.mjs';

const [recordDir, repository, runId, artifactId, macOSVersion] = process.argv.slice(2);
if (!recordDir || !repository || !runId || !artifactId || !macOSVersion) {
	throw new Error('usage: record-daemon-qualification.mjs RECORD_DIR REPOSITORY RUN_ID ARTIFACT_ID MACOS_VERSION');
}
const manifestBytes = await readBoundedRegular(join(recordDir, 'manifest.json'), 64 * 1024);
const manifest = readBundleManifest(manifestBytes);
const { commit, version, target, archiveSha256, archiveBytes, nodeVersion } = manifest;
const tests = [];
for (const id of QUALIFICATION_TESTS) {
	const evidence = await readFile(join(recordDir, `${id}.log`));
	if (evidence.length === 0 || evidence.length > 8 * 1024 ** 2) throw new Error(`invalid local evidence: ${id}`);
	tests.push({ id, result: 'pass', evidenceSha256: sha256(evidence) });
}
const record = Buffer.from(JSON.stringify({ schemaVersion: 1, qualifiedAt: new Date().toISOString(),
	candidate: { repository, commit, version, target, runId, artifactId, archiveSha256, archiveBytes, manifestSha256: sha256(manifestBytes),
		candidateOrigin: manifest.candidateOrigin },
	host: { macOSVersion, arch: 'arm64', nodeVersion }, tests }, null, 2) + '\n');
readQualification(record);
await writeFile(join(recordDir, 'qualification.v1.json'), record, { flag: 'wx' });
