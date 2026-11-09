import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(process.argv[2] ?? process.cwd());
const sdk = '@lancedb/lancedb';
const sdkVersion = '0.40.0';
const source = 'https://registry.npmjs.org/@lancedb/lancedb/-/lancedb-0.40.0.tgz';
const integrity = 'hCvk6y/gHARQ++NarvguEmX02Hm2zJAUJQgf1Sq8KznBKjI21xsK5YYzw2L0eUArDWxPjtLl4kD329ymLMqLew==';

function npm(args, cwd) {
  return execFileSync('npm', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
}

async function readManifest(dir) {
  return JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'));
}

async function writeManifest(dir, manifest) {
  await writeFile(join(dir, 'package.json'), JSON.stringify(manifest, null, 2) + '\n');
}

await mkdir(destination, { recursive: true });
const temporary = await mkdtemp(join(tmpdir(), 'insrc-memory-release-'));
try {
  const stage = join(temporary, 'package');
  npm(['run', 'build', '--', '--outDir', join(stage, 'dist')], root);
  const vendor = join(stage, 'vendor/lancedb');
  await mkdir(vendor, { recursive: true });

  const [upstream] = JSON.parse(npm(['pack', source, '--ignore-scripts', '--json'], temporary));
  const tarball = join(temporary, upstream.filename);
  assert.equal(createHash('sha512').update(await readFile(tarball)).digest('base64'), integrity, 'LanceDB archive integrity');
  execFileSync('tar', ['-xzf', tarball, '-C', vendor, '--strip-components=1'], { stdio: 'inherit' });

  const sdkManifest = await readManifest(vendor);
  assert.equal(sdkManifest.name, sdk);
  assert.equal(sdkManifest.version, sdkVersion);
  assert.equal(sdkManifest.license, 'Apache-2.0');
  const { '@huggingface/transformers': transformers, openai, ...bindings } = sdkManifest.optionalDependencies;
  assert.ok(transformers && openai && Object.keys(bindings).length > 0);
  for (const [name, version] of Object.entries(bindings)) {
    assert.ok(name.startsWith(sdk + '-'));
    assert.equal(version, sdkVersion);
  }
  await writeManifest(vendor, { ...sdkManifest, optionalDependencies: bindings });
  await cp(join(root, 'scripts/Apache-2.0.txt'), join(vendor, 'LICENSE'));

  const {
    private: sourceOnly, scripts, devDependencies, ...manifest
  } = await readManifest(root);
  assert.equal(sourceOnly, true, 'the source package must not be publishable directly');
  assert.equal(manifest.dependencies[sdk], sdkVersion);
  for (const file of manifest.files.filter(file => file !== 'dist')) {
    await cp(join(root, file), join(stage, file), { recursive: true });
  }
  const release = {
    ...manifest,
    dependencies: { ...manifest.dependencies, [sdk]: 'file:vendor/lancedb' },
    bundledDependencies: [sdk],
    optionalDependencies: bindings,
  };
  // These are the two JavaScript dependencies bundled with the upstream SDK.
  // Lock their versions in staging without passing overrides to the consumer.
  await writeManifest(stage, { ...release, overrides: { '@opentelemetry/api': '1.10.0', 'reflect-metadata': '0.2.2' } });
  npm(['install', '--install-links', '--omit=optional', '--ignore-scripts', '--no-audit', '--no-fund'], stage);
  await writeManifest(stage, release);
  const result = npm(['pack', '--ignore-scripts', '--json', '--pack-destination', destination], stage);
  process.stdout.write(result);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
