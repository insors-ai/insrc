import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { constants, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { forbidProcesses } from './_no-process-sentinel.js';
import { CODING_CLI_RECOMMENDATION } from '../dependency-context.js';
import type { ChildProcess } from 'node:child_process';
import { spawnFixture, stopOwnedChildren, childLine } from '../../daemon/tools/__tests__/_proc.js';
import { ControllerStore } from '../controller-store.js';
import { runTerminalInstall } from '../terminal-install.js';
import type { TerminalInstallOptions, TerminalUI } from '../terminal-install.js';
import { publishInstalledLauncher, retryCommand } from '../installed-launcher.js';
import { managerFixture } from './_manager-fixture.js';
import { node22Fixture } from './_runtime-fixture.js';
import type { DependencyReport, ManagerEvent } from '../contracts.js';

function setup(fresh = true) {
  const f = managerFixture();
  if (fresh) {
    const store = ControllerStore.acquire(f.location), current = store.inspect(); assert.equal(current.kind, 'present');
    if (current.kind === 'present') store.commit({ ...current.snapshot, revision: current.snapshot.revision + 1, installation: { ...current.snapshot.installation, activeReleaseId: undefined }, lastResult: undefined }, current.snapshot.revision);
    store.close(); f.state.observation = { state: 'absent', resourceOwnershipReleased: true, evidence: { kind: 'never-started' } };
  }
  const activate = f.peers.lifecycle!.activate;
  f.peers.lifecycle!.activate = async (...args) => { const ready = await activate(...args); f.state.observation = { state: 'present', identity: ready.identity, endpoint: ready.endpoint }; return ready; };
  return f;
}
function ui(answers: string[]): TerminalUI & { output: string[]; closed: boolean } {
  const output: string[] = [];
  return { streams: { stdin: { isTTY: true }, stdout: { isTTY: true }, stderr: { isTTY: true } }, output, closed: false,
    async ask(question) { output.push(question); const answer = answers.shift(); if (answer === undefined) { const error = new Error('terminal closed'); error.name = 'TerminalClosedError'; throw error; } return answer; },
    write(message) { output.push(message); }, close() { this.closed = true; } };
}
function options(f: ReturnType<typeof setup>, terminal: ReturnType<typeof ui>): TerminalInstallOptions {
  return { location: f.location, target: f.target, peers: f.peers, ui: terminal, operationId: 'terminal-operation' };
}

function priorReady(f: ReturnType<typeof setup>): ManagerEvent {
  const current = f.manager().inspect(); assert.equal(current.kind, 'present');
  if (current.kind !== 'present' || !current.snapshot.lastResult) throw new Error('Missing ready fixture');
  return { protocolVersion: 1, operationId: current.snapshot.lastResult.operationId, kind: 'result', state: current.snapshot.lastResult, retryable: false };
}

test('terminal installer requires all TTY streams and absent dev adapter fails explicitly', async () => {
  const f = setup();
  try {
    for (const stream of ['stdin', 'stdout', 'stderr'] as const) {
      const terminal = ui([]); terminal.streams = { stdin: { isTTY: true }, stdout: { isTTY: true }, stderr: { isTTY: true }, [stream]: { isTTY: false } };
      await assert.rejects(runTerminalInstall(options(f, terminal)), { code: 'install-terminal-required' });
      assert.equal(f.state.activations.length, 0);
    }
    const terminal = ui(['dev', 'https://example.invalid/repository.git', 'testing']);
    const result = await runTerminalInstall(options(f, terminal));
    assert.equal(result.errorCode, 'capability-unavailable'); assert.match(terminal.output.join(''), /s2 adapter/);
    assert.equal(f.state.shutdowns.length, 0); assert.equal(f.state.migrations.length, 0);
    const missing = ui(['', '', '']);
    assert.equal((await runTerminalInstall({ ...options(f, missing), peers: { bundle: f.peers.bundle } })).errorCode, 'capability-unavailable');
  } finally { f.cleanup(); }
});

test('ready commit and lock release precede same terminal installed TUI', { timeout: 45_000 }, async () => {
  const f = setup(), children: ChildProcess[] = [], terminal = ui(['', '', '', 'yes']);
  let daemon: ChildProcess | undefined;
  let node: Awaited<ReturnType<typeof node22Fixture>> | undefined;
  try {
    node = await node22Fixture();
    const runtime = join(f.next.directory, 'tools/node/bin/node'); mkdirSync(dirname(runtime), { recursive: true }); copyFileSync(node.executable, runtime, constants.COPYFILE_FICLONE);
    const entry = join(f.next.directory, f.next.manifest.tuiEntry); mkdirSync(dirname(entry), { recursive: true });
    const paths = new URL('../../../out/shared/paths.js', import.meta.url).href;
    const storeModule = new URL('../../../out/installer/controller-store.js', import.meta.url).href;
    writeFileSync(entry, `import fs from 'node:fs';import net from 'node:net';import {PATHS} from ${JSON.stringify(paths)};import {ControllerStore} from ${JSON.stringify(storeModule)};const location=${JSON.stringify(f.location)};const s=JSON.parse(fs.readFileSync(location.home+'/install/controller.json'));if(s.operation||s.lastResult.phase!=='ready')throw Error('not committed');const lock=ControllerStore.acquire(location);lock.close();const socket=net.createConnection(PATHS.sockFile);socket.on('error',e=>{throw e});socket.on('connect',()=>socket.write('{}\\n'));socket.on('data',d=>{const r=JSON.parse(String(d));if(r.result.releaseId!=='next')throw Error('wrong daemon');socket.end();fs.writeFileSync(location.home+'/tui-observed.json',JSON.stringify({node:process.execPath,home:PATHS.insrc,socket:PATHS.sockFile,nodeOptions:process.env.NODE_OPTIONS??null}));});`);
    writeFileSync(join(f.next.directory, f.next.manifest.managerEntry), '// fixture manager entry\n');
    writeFileSync(join(f.next.directory, 'bootstrap.mjs'), '// selected bootstrap fixture\n');
    const activate = f.peers.lifecycle!.activate;
    f.peers.lifecycle!.activate = async (...args) => {
      const ready = await activate(...args);
      daemon = spawnFixture(process.execPath, [fileURLToPath(new URL('./terminal-daemon-fixture.mjs', import.meta.url)), f.location.daemonEndpoint.address, JSON.stringify(ready.identity)], { stdio: ['pipe', 'pipe', 'pipe'] }); children.push(daemon);
      assert.equal((await childLine(daemon)).trim(), 'ready'); return ready;
    };
    const result = await runTerminalInstall(options(f, terminal)); assert.equal(result.kind, 'completed', terminal.output.join(''));
    const observed = JSON.parse(readFileSync(join(f.home, 'tui-observed.json'), 'utf8'));
    assert.equal(observed.node, runtime); assert.equal(observed.home, f.home); assert.equal(observed.socket, f.location.daemonEndpoint.address); assert.equal(observed.nodeOptions, null);
    assert.ok(terminal.closed); assert.equal(daemon!.exitCode, null, 'exiting TUI leaves the fixture daemon alive'); assert.equal(f.state.shutdowns.length, 0);
    assert.match(readFileSync(join(f.home, 'bin/insrc'), 'utf8'), /--launch-tui/);
    const before = readFileSync(join(f.home, 'install/controller.json'), 'utf8');
    const duplicate = await runTerminalInstall(options(f, ui([]))); assert.equal(duplicate.kind, 'already-completed'); assert.equal(readFileSync(join(f.home, 'install/controller.json'), 'utf8'), before);
    const closed = once(daemon!, 'close'); daemon!.stdin!.end('close\n'); assert.deepEqual(await closed, [0, null]);
  } finally { await stopOwnedChildren(children); node?.cleanup(); f.cleanup(); }
});

test('cancel install failure and post install TUI error preserve correct outcome', async () => {
  for (const mode of ['decline', 'closed', 'closed-progress', 'migration-failure', 'peer-error', 'tui-error', 'stale-readiness', 'busy'] as const) {
    const f = setup(); let launches = 0;
    try {
      const terminal = ui(mode === 'closed' ? [] : ['', '', '', mode === 'decline' ? 'no' : 'yes']);
      if (mode === 'closed-progress') terminal.write = () => { const error = new Error('terminal closed'); error.name = 'TerminalClosedError'; throw error; };
      const select: NonNullable<TerminalInstallOptions['select']> = async () => {
        const state = f.manager().inspect(); assert.equal(state.kind, 'present'); if (state.kind === 'present') assert.equal(state.snapshot.lastResult?.phase, 'ready');
        const lease = ControllerStore.acquire(f.location); lease.close();
        if (mode === 'stale-readiness') throw new Error('selected daemon readiness changed');
        return { node: 'fixture', entry: 'fixture', managerEntry: 'fixture', releaseId: 'next', location: f.location };
      };
      if (mode === 'migration-failure') f.state.journalValidated = false;
      if (mode === 'peer-error') f.peers.lifecycle!.activate = async () => { throw new Error('fixture\npeer failed'); };
      const lease = mode === 'busy' ? ControllerStore.acquire(f.location) : undefined;
      let result;
      try { result = await runTerminalInstall({ ...options(f, terminal), select, publish: () => '', launch: async () => { launches++; throw new Error('fixture TUI spawn error'); } }); }
      finally { lease?.close(); }
      if (mode === 'decline' || mode === 'closed' || mode === 'closed-progress') { assert.equal(result.kind, 'cancelled'); assert.equal(launches, 0); }
      else if (mode === 'tui-error' || mode === 'stale-readiness') {
        assert.equal(result.kind, 'post-install-tui-error'); assert.match(terminal.output.join(''), /Retry without reinstalling/);
        assert.equal(f.manager().inspect().kind, 'present'); assert.equal(f.state.activations.length, 1);
        const persisted = JSON.parse(readFileSync(join(f.home, 'install/controller.json'), 'utf8')); assert.equal(persisted.lastResult.phase, 'ready'); assert.equal(persisted.operation, undefined);
        assert.equal(launches, mode === 'tui-error' ? 1 : 0);
        assert.match(terminal.output.join(''), /--launch-tui/);
      } else {
        assert.equal(result.kind, 'failed'); assert.equal(launches, 0);
        if (mode === 'peer-error') { const persisted = JSON.parse(readFileSync(join(f.home, 'install/controller.json'), 'utf8')); assert.equal(persisted.operation.phase, 'blocked'); assert.equal(persisted.operation.message, 'fixture peer failed'); }
      }
    } finally { f.cleanup(); }
  }
});

test('terminal consent binds exact dependency offer and never installs coding CLIs', async () => {
  const f = setup(), processes = forbidProcesses();
  try {
    const report: DependencyReport = { runtimeReady: true, ollama: 'missing', ollamaInstallOffer: { id: 'offer', destination: f.home, version: 'fixture-version' }, agents: { claude: false, codex: false, vibe: false }, recommendations: [], blockers: ['Ollama missing'] };
    f.peers.dependencies!.inspect = async () => report;
    const decisions: unknown[] = [];
    f.peers.dependencies!.decide = async (_location, decision) => { decisions.push(decision); return { ...report, ollama: 'ready', blockers: [] }; };
    const terminal = ui(['', '', '', 'yes', 'no']);
    assert.equal((await runTerminalInstall(options(f, terminal))).kind, 'cancelled'); assert.deepEqual(decisions, [], 'final cancellation does not perform dependency installation');
    const declined = ui(['', '', '', 'no', 'yes']);
    f.peers.dependencies!.decide = async (_location, decision) => { decisions.push(decision); return report; };
    assert.equal((await runTerminalInstall(options(f, declined))).kind, 'failed'); assert.deepEqual(decisions, [{ offerId: 'offer', choice: 'decline' }]);
    assert.equal(declined.output.filter(line => line.trim() === CODING_CLI_RECOMMENDATION).length, 1);
    assert.equal(f.state.activations.length, 0); processes.assertUnused();
  } finally { processes.restore(); f.cleanup(); }
});

test('installed launcher preserves existing files and quotes exact private-runtime retry', () => {
  const f = setup(false), event = priorReady(f);
  try {
    const releaseId = 'old', command = publishInstalledLauncher(f.location, f.target, releaseId, event);
    assert.equal(publishInstalledLauncher(f.location, f.target, releaseId, event), command);
    assert.match(command, /releases\/old\/tools\/node/); assert.match(command, /--home/); assert.equal(command, retryCommand(f.location, f.target, releaseId));
    const file = join(f.home, 'bin/insrc'); writeFileSync(file, '# foreign launcher\n');
    assert.throws(() => publishInstalledLauncher(f.location, f.target, releaseId, event), { code: 'launcher-conflict' }); assert.equal(readFileSync(file, 'utf8'), '# foreign launcher\n');
  } finally { f.cleanup(); }
});


test('terminal cancellation settles owned work and suppresses later TUI handoff', async () => {
  for (const boundary of ['preparation', 'migration', 'activation', 'selection'] as const) {
    const f = setup(), abort = new AbortController(), terminal = ui(['', '', '', 'yes']); let launches = 0;
    try {
      if (boundary === 'preparation') {
        const prepare = f.peers.bundle.prepare;
        f.peers.bundle.prepare = async (...args) => { const candidate = await prepare(...args); abort.abort(); return candidate; };
      } else if (boundary === 'migration') {
        const journal = f.peers.migrations!.waitForJournal;
        f.peers.migrations!.waitForJournal = async (...args) => { const receipt = await journal(...args); abort.abort(); return receipt; };
      } else if (boundary === 'activation') {
        const activate = f.peers.lifecycle!.activate;
        f.peers.lifecycle!.activate = async (...args) => { const ready = await activate(...args); abort.abort(); return ready; };
      }
      const outcome = await runTerminalInstall({ ...options(f, terminal), signal: abort.signal,
        select: async () => { abort.abort(); return { node: 'fixture', entry: 'fixture', managerEntry: 'fixture', releaseId: 'next', location: f.location }; },
        publish: () => { throw new Error('cancelled operation published launcher'); }, launch: async () => { launches++; return { code: 0, signal: null }; } });
      assert.equal(outcome.kind, 'cancelled', boundary); assert.equal(outcome.code, 130); assert.equal(launches, 0);
      const state = f.manager().inspect(); assert.equal(state.kind, 'present');
      if (state.kind === 'present') {
        if (boundary === 'migration') { assert.equal(state.snapshot.operation?.phase, 'blocked'); assert.equal(state.snapshot.operation.errorCode, 'cancelled'); }
        else { assert.equal(state.snapshot.operation, undefined); assert.equal(state.snapshot.lastResult?.phase, boundary === 'preparation' ? undefined : 'ready'); }
      }
      assert.equal(f.state.shutdowns.length, 0); assert.equal(f.state.migrations.length, boundary === 'preparation' ? 0 : 1);
      assert.equal(f.state.activations.length, boundary === 'preparation' || boundary === 'migration' ? 0 : 1);
      const lock = ControllerStore.acquire(f.location); lock.close();
    } finally { f.cleanup(); }
  }
});

test('terminal upgrade retains delivery and rejects stale dependency consent before disruption', async () => {
  for (const stale of [false, true]) {
    const f = setup(false), terminal = ui(['yes', 'yes', 'yes']); const decisions: unknown[] = []; let inspections = 0;
    try {
      f.peers.dependencies!.inspect = async () => ({ runtimeReady: true, ollama: 'missing', ollamaInstallOffer: { id: stale && inspections++ ? 'changed-offer' : 'exact-offer', destination: f.home, version: 'fixture' }, agents: { claude: false, codex: false, vibe: false }, recommendations: [], blockers: ['Ollama missing'] });
      f.peers.dependencies!.decide = async (_location, decision) => { decisions.push(decision); return { runtimeReady: true, ollama: 'ready', agents: { claude: false, codex: false, vibe: false }, recommendations: [], blockers: [] }; };
      const outcome = await runTerminalInstall({ ...options(f, terminal), select: async () => ({ node: 'fixture', entry: 'fixture', managerEntry: 'fixture', releaseId: 'next', location: f.location }), publish: () => '', launch: async () => ({ code: 0, signal: null }) });
      assert.equal(outcome.kind, stale ? 'failed' : 'completed');
      assert.deepEqual(decisions, stale ? [] : [{ offerId: 'exact-offer', choice: 'install' }]);
      assert.equal(f.state.shutdowns.length, stale ? 0 : 1);
      if (stale) assert.equal(outcome.errorCode, 'dependency-offer-stale');
      const state = f.manager().inspect(); assert.equal(state.kind, 'present');
      if (state.kind === 'present') assert.deepEqual(state.snapshot.installation.delivery, { mode: 'bundle', repository: 'insors-ai/insrc', channel: 'stable' });
      assert.doesNotMatch(terminal.output.join(''), /Delivery mode:/);
    } finally { f.cleanup(); }
  }
});


test('successor upgrade replaces its owned launcher and preserves ready selection', async () => {
  const f = setup(false), terminal = ui(['yes', 'yes']); let launches = 0;
  try {
    const previous = priorReady(f), oldRelease = 'old';
    const before = JSON.stringify(f.manager().inspect());
    publishInstalledLauncher(f.location, f.target, oldRelease, previous);
    assert.equal(JSON.stringify(f.manager().inspect()), before, 'launcher does not mutate controller state');
    const file = join(f.home, 'bin/insrc'); assert.match(readFileSync(file, 'utf8'), /releases\/old\/bootstrap\.mjs/);
    const next = options(f, terminal);
    const outcome = await runTerminalInstall({ ...next,
      select: async () => ({ node: 'fixture', entry: 'fixture', managerEntry: 'fixture', releaseId: 'next', location: f.location }),
      launch: async () => {
        launches++; assert.match(readFileSync(file, 'utf8'), /releases\/next\/bootstrap\.mjs/);
        const lease = ControllerStore.acquire(f.location); lease.close();
        return { code: 0, signal: null };
      } });
    assert.equal(outcome.kind, 'completed', terminal.output.join('')); assert.equal(launches, 1);
    const after = readFileSync(file, 'utf8');
    assert.throws(() => publishInstalledLauncher(f.location, f.target, oldRelease, previous), { code: 'readiness-uncertain' });
    assert.equal(readFileSync(file, 'utf8'), after, 'stale publisher cannot restore old bootstrap');
    const lease = ControllerStore.acquire(f.location);
    try { assert.throws(() => publishInstalledLauncher(f.location, f.target, 'next', outcome.event!), { code: 'busy' }); }
    finally { lease.close(); }
    assert.equal(readFileSync(file, 'utf8'), after);
    writeFileSync(file, after + '# user modification\n');
    assert.throws(() => publishInstalledLauncher(f.location, f.target, 'next', outcome.event!), { code: 'launcher-conflict' });
    assert.equal(readFileSync(file, 'utf8'), after + '# user modification\n');
  } finally { f.cleanup(); }
});

test('saved installer selects candidate control runtime and exact post-install retry', async () => {
  for (const mode of ['success', 'tui-error', 'missing-control'] as const) {
    const f = setup(false), terminal = ui(['yes', 'yes']); let launches = 0;
    try {
      publishInstalledLauncher(f.location, f.target, 'old', priorReady(f));
      for (const entry of [f.next.manifest.tuiEntry, f.next.manifest.managerEntry, 'bootstrap.mjs']) {
        if (mode === 'missing-control' && entry === 'bootstrap.mjs') continue;
        const path = join(f.next.directory, entry); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, '// selected fixture asset\n');
      }
      const result = await runTerminalInstall({ ...options(f, terminal), launch: async selection => {
        launches++; assert.equal(selection.node, join(f.next.directory, 'tools/node/bin/node'));
        if (mode === 'tui-error') throw new Error('fixture TUI launch failure');
        return { code: 0, signal: null };
      } });
      assert.equal(result.kind, mode === 'success' ? 'completed' : 'post-install-tui-error', terminal.output.join(''));
      assert.equal(launches, mode === 'missing-control' ? 0 : 1);
      const command = retryCommand(f.location, f.target, 'next');
      assert.match(command, /releases\/next\/tools\/node/); assert.match(command, /releases\/next\/bootstrap\.mjs/);
      if (mode === 'tui-error' || mode === 'missing-control') assert.ok(terminal.output.join('').includes(command));
      if (mode !== 'missing-control') assert.match(readFileSync(join(f.home, 'bin/insrc'), 'utf8'), /releases\/next\/bootstrap\.mjs/);
      const duplicate = ui([]); assert.equal((await runTerminalInstall(options(f, duplicate))).kind, 'already-completed');
      assert.ok(duplicate.output.join('').includes(command), 'duplicate completion uses the selected release too');
      const current = f.manager().inspect(); assert.equal(current.kind, 'present');
      if (current.kind === 'present') assert.equal(current.snapshot.installation.activeReleaseId, 'next');
    } finally { f.cleanup(); }
  }
});

test('coding-cli-advice-emitted-once-and-install-spawn-sentinels-remain-zero', async () => {
  for (const count of [0, 1, 3]) for (const recommendations of [[], [CODING_CLI_RECOMMENDATION, CODING_CLI_RECOMMENDATION]]) {
    const f = setup(), processes = forbidProcesses();
    try {
      f.peers.dependencies!.inspect = async () => ({ runtimeReady: true, ollama: 'ready',
        agents: { claude: count > 0, codex: count > 1, vibe: count > 1 },
        recommendations: count ? [] : recommendations, blockers: [] });
      const terminal = ui(['', '', '', 'no']);
      assert.equal((await runTerminalInstall(options(f, terminal))).kind, 'cancelled');
      assert.equal(terminal.output.filter(line => line.trim() === CODING_CLI_RECOMMENDATION).length, count ? 0 : 1);
      assert.equal(f.state.activations.length, 0); processes.assertUnused();
    } finally { processes.restore(); f.cleanup(); }
  }
});
