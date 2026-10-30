/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { mkdirSync, writeFileSync, readFileSync, realpathSync, lstatSync, openSync, closeSync, fstatSync, ftruncateSync, constants } from 'node:fs';
import { join, dirname, relative, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { digestValue, freezeValue } from '../workflow/code-review/investigation/identity.js';
import { investigationFileDigest } from '../agent/providers/investigation-session.js';

export const CANARY_CAPABILITIES = ['hooks', 'plugins', 'repository-instructions', 'project-mcp'] as const;
export const CANARY_SIGNAL_BYTES = 32 * 1024;
export type CanaryPhase = 'control' | 'restricted';
const signalSchema = z.object({ version: z.literal(1), probeId: z.uuid(), attemptId: z.uuid(),
  bindingDigest: z.string().regex(/^[a-f0-9]{64}$/), phase: z.enum(['control', 'restricted']),
  capability: z.enum(CANARY_CAPABILITIES), event: z.enum(['SessionStart', 'InstructionsLoaded', 'mcp-start']),
}).strict();
export type ProbeCanarySignal = z.infer<typeof signalSchema>;
const shellQuote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;
const manifestSchema = z.object({ version: z.literal(1), probeId: z.uuid(), attemptId: z.uuid(), marker: z.uuid(), cwd: z.string(),
  bindingDigest: z.string().regex(/^[a-f0-9]{64}$/), files: z.array(z.object({ path: z.string(), digest: z.string().regex(/^[a-f0-9]{64}$/) }).strict()).length(10),
}).strict();
function privateText(path: string, bound: number): string {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) || (process.getuid && stat.uid !== process.getuid()) || stat.size > bound || realpathSync(path) !== path)
      throw Error('Unsafe canary evidence');
    const text = readFileSync(fd, 'utf8'); if (Buffer.byteLength(text) > bound) throw Error('Canary observation bound'); return text;
  } finally { closeSync(fd); }
}
function parseSignals(text: string, binding: { probeId: string; attemptId: string; bindingDigest: string }, phase: CanaryPhase) {
  const values = text.split('\n').filter(Boolean); if (values.length > 128) throw Error('Canary signal count bound');
  return values.map(line => {
    const signal = signalSchema.parse(JSON.parse(line));
    if (signal.phase !== phase || signal.probeId !== binding.probeId || signal.attemptId !== binding.attemptId || signal.bindingDigest !== binding.bindingDigest) throw Error('Foreign canary observation');
    return signal;
  });
}

/** Read-only revalidation after export/restart. No path chosen by the model. */
export function readProbeCanaryEvidence(manifestPath: string) {
  const root = dirname(manifestPath), stat = lstatSync(root);
  if (basename(manifestPath) !== 'canary-manifest.json' || !basename(root).startsWith('insrc-p-') ||
    !stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || realpathSync(root) !== root) throw Error('Unsafe canary root');
  const manifest = manifestSchema.parse(JSON.parse(privateText(manifestPath, 65536)));
  if (manifest.cwd !== join(root, 'cwd') || manifest.bindingDigest !== digestValue({ version: manifest.version, probeId: manifest.probeId,
    attemptId: manifest.attemptId, marker: manifest.marker, cwd: manifest.cwd })) throw Error('Foreign canary manifest');
  const allowed = new Set(['synthetic-config/canary-record.mjs','synthetic-config/canary-marker.mjs','cwd/.claude/settings.json','cwd/CLAUDE.md',
    'synthetic-config/canary-mcp.mjs','cwd/.mcp.json','synthetic-config/synthetic-mcp.json',
    'synthetic-config/plugin-canary/.claude-plugin/plugin.json','synthetic-config/plugin-canary/hooks/hooks.json','canary-control-settings.json']);
  for (const file of manifest.files) {
    if (!allowed.delete(relative(root, file.path))) throw Error('Foreign or duplicate canary file');
    privateText(file.path, 65536);
    if (investigationFileDigest(file.path) !== file.digest) throw Error('Canary fixture changed');
  }
  const control = parseSignals(privateText(join(root, 'canary-control.jsonl'), CANARY_SIGNAL_BYTES), manifest, 'control');
  const restricted = parseSignals(privateText(join(root, 'canary-restricted.jsonl'), CANARY_SIGNAL_BYTES), manifest, 'restricted');
  return { manifest, manifestDigest: digestValue(manifest), control, restricted, checks: assessProbeCanaries(control, restricted) };
}

/** No actual user configuration, plugin installation or OAuth data is touched. */
export function createProbeCanaries(root: string, cwd: string, probeId: string, attemptId: string) {
  const directory = join(root, 'synthetic-config'), pluginDir = join(directory, 'plugin-canary');
  for (const path of [directory, join(cwd, '.claude'), join(pluginDir, '.claude-plugin'), join(pluginDir, 'hooks')])
    mkdirSync(path, { recursive: true, mode: 0o700 });
  const binding = { version: 1 as const, probeId, attemptId, marker: randomUUID(), cwd };
  const bindingDigest = digestValue(binding), files: { path: string; digest: string }[] = [];
  const put = (path: string, text: string) => { writeFileSync(path, text, { mode: 0o600, flag: 'wx' }); files.push({ path, digest: investigationFileDigest(path) }); };
  const signalPaths = { control: join(root, 'canary-control.jsonl'), restricted: join(root, 'canary-restricted.jsonl') };
  for (const path of Object.values(signalPaths)) writeFileSync(path, '', { mode: 0o600, flag: 'wx' });
  // Host-owned phase state keeps the restricted launch environment identical
  // to production. The runner switches it only after the prior child drains.
  const phasePath = join(root, 'canary-active-phase.json');
  writeFileSync(phasePath, JSON.stringify('restricted'), { mode: 0o600, flag: 'wx' });
  const recorder = join(directory, 'canary-record.mjs'), markerScript = join(directory, 'canary-marker.mjs');
  const instructionPath = join(cwd, 'CLAUDE.md');
  put(recorder, `import {openSync,closeSync,writeFileSync,readFileSync,fstatSync,constants} from 'node:fs';
export function record(capability,input){
 const phaseFd=openSync(${JSON.stringify(phasePath)},constants.O_RDONLY|constants.O_NOFOLLOW);let phase;
 try{if(fstatSync(phaseFd).size>64)throw Error('Canary phase bound');phase=JSON.parse(readFileSync(phaseFd,'utf8'));}finally{closeSync(phaseFd);}
 if(!['control','restricted'].includes(phase))throw Error('Canary phase missing');
 if(!${JSON.stringify(CANARY_CAPABILITIES)}.includes(capability))throw Error('Canary capability invalid');
 const event=capability==='project-mcp'?'mcp-start':input?.hook_event_name;
 if(capability==='repository-instructions'&&(event!=='InstructionsLoaded'||input?.file_path!==${JSON.stringify(instructionPath)}))return;
 if(capability!=='project-mcp'&&!['SessionStart','InstructionsLoaded'].includes(event))throw Error('Canary event invalid');
 const paths=${JSON.stringify(signalPaths)},line=JSON.stringify({version:1,probeId:${JSON.stringify(probeId)},attemptId:${JSON.stringify(attemptId)},bindingDigest:${JSON.stringify(bindingDigest)},phase,capability,event})+'\\n';
 const fd=openSync(paths[phase],constants.O_WRONLY|constants.O_APPEND|constants.O_NOFOLLOW);
 try{const s=fstatSync(fd);if(!s.isFile()||s.nlink!==1||(s.mode&0o077)||s.size+Buffer.byteLength(line)>${CANARY_SIGNAL_BYTES})throw Error('Canary observation bound');writeFileSync(fd,line);}finally{closeSync(fd);}
}
`);
  put(markerScript, `import {record} from './canary-record.mjs';let text='';for await(const c of process.stdin){text+=c;if(Buffer.byteLength(text)>16384)throw Error('Canary input bound');}record(process.argv[2],JSON.parse(text||'{}'));\n`);
  const command = (capability: string) => `${shellQuote(realpathSync(process.execPath))} ${shellQuote(markerScript)} ${shellQuote(capability)}`;
  const hook = (capability: string) => [{ hooks: [{ type: 'command', command: command(capability), timeout: 5 }] }];
  const settings = { hooks: { SessionStart: hook('hooks'), InstructionsLoaded: hook('repository-instructions') } };
  put(join(cwd, '.claude', 'settings.json'), JSON.stringify(settings));
  put(instructionPath, `# Harmless isolation canary\nMarker ${binding.marker}. This is a synthetic test instruction file. Do not execute commands or report that absence proves isolation.\n`);
  const fakeMcp = join(directory, 'canary-mcp.mjs');
  put(fakeMcp, `import {record} from './canary-record.mjs';import {createInterface} from 'node:readline';
record('project-mcp',null);createInterface({input:process.stdin}).on('line',line=>{try{const r=JSON.parse(line);if(r.id===undefined)return;const result=r.method==='initialize'?{protocolVersion:r.params?.protocolVersion??'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'inert-probe',version:'1'}}:r.method==='tools/list'?{tools:[{name:'canary_unscoped',description:'Harmless isolation marker',inputSchema:{type:'object',properties:{}}}]}:{content:[{type:'text',text:'inert canary'}]};process.stdout.write(JSON.stringify({jsonrpc:'2.0',id:r.id,result})+'\\n');}catch{}});\n`);
  const mcp = { mcpServers: { 'inert-probe': { command: realpathSync(process.execPath), args: [fakeMcp] } } };
  put(join(cwd, '.mcp.json'), JSON.stringify(mcp));
  put(join(directory, 'synthetic-mcp.json'), JSON.stringify(mcp));
  put(join(pluginDir, '.claude-plugin', 'plugin.json'), JSON.stringify({ name: 'insrc-isolation-canary', version: '1.0.0' }));
  put(join(pluginDir, 'hooks', 'hooks.json'), JSON.stringify({ hooks: { SessionStart: hook('plugins') } }));
  const controlSettings = join(root, 'canary-control-settings.json');
  put(controlSettings, JSON.stringify({ ...settings, enableAllProjectMcpServers: true, enabledMcpjsonServers: ['inert-probe'] }));
  const manifest = freezeValue({ ...binding, bindingDigest, files }), manifestDigest = digestValue(manifest);
  const manifestPath = join(root, 'canary-manifest.json'); writeFileSync(manifestPath, JSON.stringify(manifest), { mode: 0o600, flag: 'wx' });
  function assertCurrent() {
    for (const file of [...files, { path: manifestPath, digest: investigationFileDigestFromManifest }]) {
      const s = lstatSync(file.path);
      if (!s.isFile() || s.isSymbolicLink() || s.nlink !== 1 || (s.mode & 0o077) ||
        realpathSync(file.path) !== file.path || investigationFileDigest(file.path) !== file.digest) throw Error('Canary fixture changed');
    }
  }
  const investigationFileDigestFromManifest = investigationFileDigest(manifestPath);
  function activate(phase: CanaryPhase) {
    assertCurrent(); if (!['control', 'restricted'].includes(phase)) throw Error('Invalid canary phase');
    const fd = openSync(phasePath, constants.O_WRONLY | constants.O_NOFOLLOW);
    try {
      const stat = fstatSync(fd); if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077)) throw Error('Unsafe canary phase');
      ftruncateSync(fd, 0); writeFileSync(fd, JSON.stringify(phase));
    } finally { closeSync(fd); }
  }
  function signals(phase: CanaryPhase): readonly ProbeCanarySignal[] {
    assertCurrent(); return parseSignals(privateText(signalPaths[phase], CANARY_SIGNAL_BYTES), manifest, phase);
  }
  return { directory, pluginDir, controlSettings, manifestPath, manifest, manifestDigest, markerScript, fakeMcp, signalPaths, assertCurrent, activate, signals };
}

/** Control activity validates instrumentation; silence never proves exclusion. */
export function assessProbeCanaries(control: readonly ProbeCanarySignal[], restricted: readonly ProbeCanarySignal[]) {
  return CANARY_CAPABILITIES.map(capability => ({ capability,
    controlObserved: control.some(s => s.capability === capability), restrictedObserved: restricted.some(s => s.capability === capability),
    verdict: restricted.some(s => s.capability === capability) ? 'observed-allowed' as const : 'unverifiable' as const }));
}
