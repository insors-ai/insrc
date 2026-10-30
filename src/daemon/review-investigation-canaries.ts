/* Copyright (c) Procix Software India. Licensed under the MIT License. */
import { mkdirSync, writeFileSync, readFileSync, realpathSync, lstatSync, openSync, closeSync, fstatSync, constants } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { digestValue, freezeValue } from '../workflow/code-review/investigation/identity.js';
import { investigationFileDigest } from '../agent/providers/investigation-session.js';

export const CANARY_CAPABILITIES = ['hooks', 'plugins', 'repository-instructions', 'project-mcp'] as const;
export const CANARY_SIGNAL_BYTES = 32 * 1024;
export const CANARY_PHASE_ENV = 'INSRC_PROBE_CANARY_PHASE';
export type CanaryPhase = 'control' | 'restricted';
const signalSchema = z.object({ version: z.literal(1), probeId: z.uuid(), attemptId: z.uuid(),
  bindingDigest: z.string().regex(/^[a-f0-9]{64}$/), phase: z.enum(['control', 'restricted']),
  capability: z.enum(CANARY_CAPABILITIES), event: z.enum(['SessionStart', 'InstructionsLoaded', 'mcp-start']),
}).strict();
export type ProbeCanarySignal = z.infer<typeof signalSchema>;
const shellQuote = (s: string) => `'${s.replaceAll("'", "'\\''")}'`;

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
  const recorder = join(directory, 'canary-record.mjs'), markerScript = join(directory, 'canary-marker.mjs');
  const instructionPath = join(cwd, 'CLAUDE.md');
  put(recorder, `import {openSync,closeSync,writeFileSync,fstatSync,constants} from 'node:fs';
export function record(capability,input){
 const phase=process.env[${JSON.stringify(CANARY_PHASE_ENV)}];if(!['control','restricted'].includes(phase))throw Error('Canary phase missing');
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
  function signals(phase: CanaryPhase): readonly ProbeCanarySignal[] {
    assertCurrent(); const fd = openSync(signalPaths[phase], constants.O_RDONLY | constants.O_NOFOLLOW);
    let text: string;
    try {
      const stat = fstatSync(fd);
      if (!stat.isFile() || stat.nlink !== 1 || (stat.mode & 0o077) || stat.size > CANARY_SIGNAL_BYTES) throw Error('Unsafe canary observation');
      text = readFileSync(fd, 'utf8');
      if (Buffer.byteLength(text) > CANARY_SIGNAL_BYTES) throw Error('Canary observation bound');
    } finally { closeSync(fd); }
    const values = text.split('\n').filter(Boolean);
    if (values.length > 128) throw Error('Canary signal count bound');
    return values.map(line => {
      const signal = signalSchema.parse(JSON.parse(line));
      if (signal.phase !== phase || signal.probeId !== probeId || signal.attemptId !== attemptId || signal.bindingDigest !== bindingDigest) throw Error('Foreign canary observation');
      return signal;
    });
  }
  return { directory, pluginDir, controlSettings, manifestPath, manifest, manifestDigest, markerScript, fakeMcp, signalPaths, assertCurrent, signals };
}

/** Control activity validates instrumentation; silence never proves exclusion. */
export function assessProbeCanaries(control: readonly ProbeCanarySignal[], restricted: readonly ProbeCanarySignal[]) {
  return CANARY_CAPABILITIES.map(capability => ({ capability,
    controlObserved: control.some(s => s.capability === capability), restrictedObserved: restricted.some(s => s.capability === capability),
    verdict: restricted.some(s => s.capability === capability) ? 'observed-allowed' as const : 'unverifiable' as const }));
}
