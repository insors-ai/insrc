import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';

type Alert = {
  number: number;
  dependency: { package: { name: string }; manifest_path: string };
  vulnerability: { severity: string; vulnerable_version_range: string };
};

const require = createRequire(import.meta.url);
const { satisfies, validRange } = require('semver') as {
  satisfies(version: string, range: string): boolean;
  validRange(range: string): string | null;
};
const baseline = '33eefb2693c64ae393b54ebda479c5dce182d846';
const snapshot = JSON.parse(readFileSync(new URL('./DEPENDABOT-SNAPSHOT.json', import.meta.url), 'utf8')) as Alert[];
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
  packages: Record<string, { version?: string }>;
};

test('all scoped root advisory ranges clear and archived lockfiles remain byte-identical', () => {
  assert.equal(new Set(snapshot.map(alert => alert.number)).size, 130);
  const excluded = snapshot.filter(alert => alert.vulnerability.severity === 'low');
  const included = snapshot.filter(alert => alert.vulnerability.severity !== 'low');
  const root = included.filter(alert => alert.dependency.manifest_path === 'package-lock.json');
  const archived = included.filter(alert => alert.dependency.manifest_path !== 'package-lock.json');
  assert.equal(excluded.length, 8);
  assert.equal(root.length, 110);
  assert.equal(archived.length, 12);

  for (const alert of root) {
    const suffix = 'node_modules/' + alert.dependency.package.name;
    const range = alert.vulnerability.vulnerable_version_range.replaceAll(',', '');
    assert.ok(validRange(range), 'GitHub advisory #' + alert.number + ' has an invalid range');
    for (const [path, entry] of Object.entries(lock.packages)) {
      if (path !== suffix && !path.endsWith('/' + suffix)) continue;
      assert.ok(entry.version && !satisfies(entry.version, range), '#' + alert.number + ' still affects ' + path);
    }
  }
  const archives = new Set(archived.map(alert => alert.dependency.manifest_path));
  assert.equal(archives.size, 4);
  for (const path of archives) {
    assert.deepEqual(readFileSync(path), execFileSync('git', ['show', baseline + ':' + path]), path);
  }
});
