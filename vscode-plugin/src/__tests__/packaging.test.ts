/**
 * Story E20260921ad0d45c9:S006 / t6 — Marketplace packaging tests.
 *
 * Three groups, all node:test (tsx --test), the same runner S001-S005 use:
 *   - manifest (t2): package.json carries the Marketplace fields + scripts and is
 *     no longer private, the 7 contributes.commands preserved.
 *   - boundary + workflow (t4/t5): .vscodeignore excludes source/tests/daemon
 *     internals but keeps assets/ + out/; the publish workflow is
 *     workflow_dispatch-only, Marketplace-only, PAT from a secret.
 *   - bundle smoke (t1): esbuild really emits self-contained CJS out/extension.js
 *     (requires with a fake vscode, exposes activate/deactivate) + out/uninstall.js
 *     (runs under node with a temp HOME), and no daemon internals leak into out/*.js.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import Module from 'node:module';

const HERE = dirname(fileURLToPath(import.meta.url));
const PKG = join(HERE, '..', '..'); // vscode-plugin/
const REPO = join(PKG, '..'); // repo root

const pkg = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'));

// ---------------------------------------------------------------------------
// t2 — the Marketplace manifest
// ---------------------------------------------------------------------------

test('package.json carries every Marketplace-required field for a single installable package (ac1)', () => {
  for (const field of ['publisher', 'repository', 'license', 'icon', 'keywords', 'categories', 'engines', 'main', 'activationEvents']) {
    assert.ok(pkg[field] !== undefined, `manifest must carry ${field}`);
  }
  assert.equal(pkg.engines.vscode, '^1.75.0', 'engines.vscode preserved from S001');
  assert.equal(pkg.main, './out/extension.js', 'main preserved from S001');
  assert.equal(pkg.icon, 'icon.png', 'icon points at the shipped listing icon');
  assert.ok(Array.isArray(pkg.keywords) && pkg.keywords.length > 0, 'keywords is a non-empty list');
});

test('the 7 durable ad0d45c9 contributes.commands are preserved + the config/panel-track additions (S003 refresh, S004 panel commands)', () => {
  const ids = (pkg.contributes?.commands ?? []).map((c: { command: string }) => c.command);
  const shipped = [
    'insrc.daemon.install',
    'insrc.daemon.restart',
    'insrc.daemon.start',
    'insrc.daemon.stop',
    'insrc.daemon.update',
    'insrc.hosts.wire',
    'insrc.workspace.register',
  ];
  for (const id of shipped) assert.ok(ids.includes(id), `shipped command ${id} must be preserved`);
  // S003 adds the Refresh command; S004 adds the two panel palette commands. The
  // status-bar menu command (insrc.status.menu) is set on the status-bar item in
  // extension.ts and is deliberately NOT a palette entry.
  assert.ok(!ids.includes('insrc.status.menu'), 'insrc.status.menu is a status-bar command, not a palette entry');
  assert.deepEqual(
    ids.slice().sort(),
    [...shipped, 'insrc.settings.refresh', 'insrc.status.detailed', 'insrc.status.repoConfig', 'insrc.models.setTier'].sort(),
    'the 7 shipped commands + insrc.settings.refresh + the 2 S004 panel commands + the S003 model-picker command, no others',
  );
});

test('S003 model-picker: contributes the palette-reachable insrc.models.setTier command (k6)', () => {
  const cmd = (pkg.contributes?.commands ?? []).find(
    (c: { command: string }) => c.command === 'insrc.models.setTier',
  );
  assert.ok(cmd !== undefined, 'insrc.models.setTier must be contributed');
  assert.equal(cmd.title, 'Set model tier', 'the command title');
  assert.equal(cmd.category, 'insrc', 'the palette shows it as "insrc: Set model tier"');
});

test('package.json no longer sets private:true (so vsce can package/publish)', () => {
  assert.notEqual(pkg.private, true, 'private must be removed for vsce to publish');
});

test('scripts include bundle + package (vsce) + vscode:prepublish (typecheck+bundle) + the preserved vscode:uninstall', () => {
  const s = pkg.scripts ?? {};
  assert.match(s.bundle ?? '', /esbuild/, 'bundle runs esbuild');
  assert.match(s.package ?? '', /@vscode\/vsce/, 'package runs vsce');
  assert.match(s['vscode:prepublish'] ?? '', /tsc/, 'prepublish typechecks');
  assert.match(s['vscode:prepublish'] ?? '', /bundle/, 'prepublish also bundles');
  assert.equal(s['vscode:uninstall'], 'node ./out/uninstall.js', 'the S005 uninstall hook is preserved');
});

test('esbuild is a declared devDependency (not relied on transitively) — review LOW fix', () => {
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  assert.ok('esbuild' in deps, 'esbuild must be an explicit dependency of vscode-plugin');
});

// ---------------------------------------------------------------------------
// t4 — the .vsix content boundary
// ---------------------------------------------------------------------------

test('.vscodeignore excludes source/tests/tsconfig/.github/raw-src but keeps assets/ and out/ (k5)', () => {
  const ignore = readFileSync(join(PKG, '.vscodeignore'), 'utf8');
  // The load-bearing exclusions (vsce only matches globs WITHIN the package root,
  // so the sibling repo `src/` needs no glob — vsce's root boundary excludes it).
  for (const pat of ['src/**', '**/__tests__/**', '**/*.test.ts', 'tsconfig.json', '.github/**']) {
    assert.ok(ignore.includes(pat), `.vscodeignore must exclude ${pat}`);
  }
  // assets/ + out/ are the runtime bits that MUST travel — never excluded.
  assert.doesNotMatch(ignore, /^\s*assets\/\*?\*?\s*$/m, '.vscodeignore must NOT exclude assets/');
  assert.doesNotMatch(ignore, /^\s*out\/\*?\*?\s*$/m, '.vscodeignore must NOT exclude out/');
});

// ---------------------------------------------------------------------------
// t5 — the manual publish workflow
// ---------------------------------------------------------------------------

test('the publish workflow is workflow_dispatch-only (no push/pull_request/schedule) with no test job (k7/lc2)', () => {
  const wf = readFileSync(join(REPO, '.github', 'workflows', 'vscode-plugin.yml'), 'utf8');
  assert.match(wf, /^on:\s*$/m, 'declares an on: block');
  assert.match(wf, /workflow_dispatch/, 'trigger is workflow_dispatch');
  assert.doesNotMatch(wf, /^\s*push:/m, 'no push trigger');
  assert.doesNotMatch(wf, /^\s*pull_request:/m, 'no pull_request trigger');
  assert.doesNotMatch(wf, /^\s*schedule:/m, 'no schedule trigger');
  // No `run:` step invokes a test runner (a comment mentioning `npm test` is fine) — repo convention avoids CI minutes.
  assert.doesNotMatch(wf, /^\s*run:.*(npm test|tsx --test|vitest|jest)/m, 'runs no test job on CI (repo convention)');
});

test('the workflow publishes via vsce to the Marketplace only (no ovsx) + reads the PAT from a secret (lc1/k2)', () => {
  const wf = readFileSync(join(REPO, '.github', 'workflows', 'vscode-plugin.yml'), 'utf8');
  assert.match(wf, /@vscode\/vsce[^\n]*publish/, 'publishes via vsce');
  // No ACTUAL Open VSX publish step (an explanatory comment mentioning ovsx is fine) — lc1.
  assert.doesNotMatch(wf, /ovsx\s+publish|npx[^\n]*ovsx|run:[^\n]*ovsx/i, 'no Open VSX / ovsx publish step (lc1)');
  assert.match(wf, /VSCE_PAT:\s*\$\{\{\s*secrets\.VSCE_PAT\s*\}\}/, 'PAT comes from secrets.VSCE_PAT, never inlined');
  assert.match(wf, /working-directory:\s*vscode-plugin/, 'mirrors jetbrains-plugin.yml working-directory shape');
});

// ---------------------------------------------------------------------------
// t1 — the esbuild bundle smoke (real emit, loadable CJS, no daemon internals)
// ---------------------------------------------------------------------------

/**
 * Bundle the extension into a throwaway root that FAITHFULLY reproduces the
 * shipped layout: a `{ "type": "module" }` package.json (like vscode-plugin's
 * own ESM manifest) directly above `out/`. This is the layout that would break a
 * CJS `.js` bundle unless the bundle also writes `out/package.json` = CommonJS —
 * so a smoke test bundling into a bare tmpdir would PASS on a broken bundle and
 * hide the defect. We run the REAL `bundle()` from esbuild.mjs so the fix is
 * exercised, and return the emitted `out/` dir. Returns `{ out, cleanup }`.
 */
async function bundleIntoRealLayout(): Promise<{ out: string; cleanup: () => void }> {
  const root = mkdtempSync(join(tmpdir(), 'insrc-extroot-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'insrc-vscode', type: 'module' }));
  const out = join(root, 'out');
  mkdirSync(out, { recursive: true });
  const mod = (await import('../../esbuild.mjs')) as { bundle: (outdir: string) => Promise<void> };
  await mod.bundle(out);
  return { out, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test('esbuild emits self-contained CJS out/extension.js that loads under an ESM (type:module) root (requires with a fake vscode, exposes activate/deactivate)', async () => {
  const { out, cleanup } = await bundleIntoRealLayout();
  try {
    const extPath = join(out, 'extension.js');
    const uninPath = join(out, 'uninstall.js');
    assert.ok(existsSync(extPath) && existsSync(uninPath), 'both entries emitted');
    // The CJS marker that lets the .js bundle load as CommonJS under the ESM root.
    assert.equal(
      JSON.parse(readFileSync(join(out, 'package.json'), 'utf8')).type,
      'commonjs',
      'out/package.json pins out/ to CommonJS (else the bundle loads as ESM and crashes)',
    );

    // CommonJS, with 'vscode' left as an external require (not inlined).
    const extSrc = readFileSync(extPath, 'utf8');
    assert.match(extSrc, /require\(["']vscode["']\)/, "'vscode' is left as an external require");
    assert.doesNotMatch(extSrc, /\.\.\/\.\.\/src\/shared/, 'the cross-package ../../src import is inlined, not left dangling');

    // Require the bundle with a fake `vscode` injected via Module._load.
    const origLoad = (Module as unknown as { _load: (...a: unknown[]) => unknown })._load;
    const fakeVscode = makeFakeVscode();
    (Module as unknown as { _load: (...a: unknown[]) => unknown })._load = function (request: string, ...rest: unknown[]) {
      if (request === 'vscode') return fakeVscode;
      return (origLoad as (...a: unknown[]) => unknown)(request, ...rest);
    };
    try {
      const requireCjs = createRequire(import.meta.url);
      const mod = requireCjs(extPath) as { activate?: unknown; deactivate?: unknown };
      assert.equal(typeof mod.activate, 'function', 'bundle exposes activate()');
      assert.equal(typeof mod.deactivate, 'function', 'bundle exposes deactivate()');
    } finally {
      (Module as unknown as { _load: unknown })._load = origLoad;
    }
  } finally {
    cleanup();
  }
});

test('the emitted out/uninstall.js, run as `node out/uninstall.js` under a temp HOME, actually SWEEPS the wired hosts (main-check fires) and never touches the real $HOME', async () => {
  const { out, cleanup } = await bundleIntoRealLayout();
  const home = mkdtempSync(join(tmpdir(), 'insrc-home-'));
  try {
    // Plant a Claude Code config (the HOST_SPECS target <HOME>/.claude.json) that
    // is WIRED with insrc alongside another server. If runUninstall actually runs,
    // the sweep removes only the insrc key. This is the non-vacuous proof that the
    // realpath-normalized argv[1] main-check FIRED (a plain === would skip it when
    // the temp dir is under a symlink like macOS /var -> /private/var).
    const claudeCfg = join(home, '.claude.json');
    writeFileSync(claudeCfg, JSON.stringify({ mcpServers: { insrc: { command: 'node', args: ['/x'] }, other: { command: 'y' } } }));

    execFileSync(process.execPath, [join(out, 'uninstall.js')], {
      env: { ...process.env, HOME: home, USERPROFILE: home },
      stdio: 'ignore',
    });

    const after = JSON.parse(readFileSync(claudeCfg, 'utf8'));
    assert.equal('insrc' in after.mcpServers, false, 'the sweep removed mcpServers.insrc (runUninstall fired)');
    assert.deepEqual(after.mcpServers.other, { command: 'y' }, 'the sweep preserved the host\'s other server');

    // k5: the bundle must inline ONLY the thin ipc-client (node:net + pure types
    // + paths). The precise leak signal is a require() of something other than a
    // node: builtin or the external 'vscode' — NOT the bare substrings 'lmdb'/
    // 'analyze/' etc., which appear only as ~/.insrc path-name string constants
    // and doc comments in the shared paths module, not as imported daemon code.
    const allowedRequire = /^(node:[a-z_/]+|vscode)$/;
    // Daemon storage/parse LIBRARIES would only enter the bundle via a require —
    // assert none did (belt-and-braces on top of the allowlist).
    const forbiddenLibs = ['lancedb', '@lancedb', '@duckdb', 'tree-sitter', 'lmdb-js'];
    for (const name of ['extension.js', 'uninstall.js']) {
      const src = readFileSync(join(out, name), 'utf8');
      const requires = [...src.matchAll(/require\("([^"]+)"\)/g)].map((m) => m[1]!);
      for (const spec of requires) {
        assert.match(spec, allowedRequire, `${name} require("${spec}") — only node builtins + vscode may be required (k5)`);
      }
      for (const lib of forbiddenLibs) {
        assert.ok(!requires.includes(lib), `${name} must not require daemon library '${lib}' (k5)`);
      }
    }
  } finally {
    cleanup();
    rmSync(home, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  }
});

/** A structural stub of the `vscode` API surface the bundle touches at load. */
function makeFakeVscode(): unknown {
  const noop = (): void => {};
  const disposable = { dispose: noop };
  return {
    window: {
      createStatusBarItem: () => ({ text: '', tooltip: undefined, command: undefined, show: noop, hide: noop, dispose: noop }),
      showInformationMessage: async () => undefined,
    },
    StatusBarAlignment: { Left: 1, Right: 2 },
    commands: { registerCommand: () => disposable },
    extensions: { getExtension: () => undefined },
    env: { appName: 'VS Code', uriScheme: 'vscode' },
    workspace: { workspaceFolders: undefined },
  };
}
