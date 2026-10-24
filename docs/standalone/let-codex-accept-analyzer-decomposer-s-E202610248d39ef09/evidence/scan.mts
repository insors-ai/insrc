import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
const R = '/Users/subhagho/work/projects/insors/insrc';
const { codexStrictSchema } = await import(`${R}/src/agent/providers/structured-output.ts`);
const files: string[] = [];
const walk = (d: string) => { for (const n of readdirSync(d)) { const p = join(d, n); if (n === '__tests__' || n === 'node_modules') continue; if (statSync(p).isDirectory()) walk(p); else if (p.endsWith('.ts')) files.push(p); } };
for (const d of ['src/analyze', 'src/workflow', 'src/daemon/steps', 'src/agent']) walk(join(R, d));
const bad = (node: any, path: string, out: string[]) => {
  if (Array.isArray(node)) { node.forEach((n, i) => bad(n, `${path}[${i}]`, out)); return; }
  if (node === null || typeof node !== 'object') return;
  const t = node.type; const isObj = t === 'object' || (Array.isArray(t) && t.includes('object'));
  if (isObj && node.properties === undefined) out.push(path || '(root)');
  for (const [k, v] of Object.entries(node)) if (k !== 'enum' && k !== 'const' && k !== 'default' && k !== 'examples') bad(v, path ? `${path}.${k}` : k, out);
};
const seen = new Set<unknown>();
for (const f of files) {
  let mod: any; try { mod = await import(f); } catch { continue; }
  for (const [name, v] of Object.entries(mod)) {
    if (v === null || typeof v !== 'object' || seen.has(v)) continue;
    const s = v as any; if (s.type !== 'object' || s.properties === undefined) continue;
    seen.add(v);
    let strict: any; try { strict = codexStrictSchema(s); } catch (e) { console.log(`THROWS ${f.replace(R + '/', '')} ${name}: ${(e as Error).message.slice(0, 120)}`); continue; }
    const out: string[] = []; bad(strict, '', out);
    if (out.length) console.log(`OPEN ${f.replace(R + '/', '')} ${name}: ${out.slice(0, 6).join(' | ')}${out.length > 6 ? ` (+${out.length - 6})` : ''}`);
  }
}
