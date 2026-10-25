import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const require=createRequire(process.cwd()+'/package.json');
const {marked}=await import(require.resolve('marked'));
const runtime=fs.readFileSync('src/assets/docgen/mermaid.min.js','utf8');
const panzoom=fs.readFileSync('src/assets/docgen/svg-pan-zoom.min.js','utf8');
const script=s=>'<script>'+s.replace(/<\/script/gi,'<\\/script')+'</script>';
function checkedHtml(html){
  const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  for(const match of scripts)new vm.Script(match[1]);
  return html;
}
const mock=fs.readFileSync('docs/mocks/ontology-source/ontology.template.html','utf8');
// Use a replacement callback: vendor code contains dollar replacement patterns.
for(const mode of (process.argv.includes('--prd-only')?[]:['viewer','editor']))fs.writeFileSync('docs/mocks/ontology-'+mode+'.html',checkedHtml(mock.replaceAll('__MODE__',mode).replace('<!-- VENDORED_RUNTIME -->',()=>script(runtime)+script(panzoom))));
const md=fs.readFileSync('docs/ontology-builder-prd.md','utf8');
let body=marked.parse(md);
const slug=s=>s.replace(/<[^>]+>/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const toc=[];
body=body.replace(/<h([23])>(.*?)<\/h\1>/g,(_,level,title)=>{const id=slug(title);if(level==='2')toc.push({id,title});return `<h${level} id="${id}">${title}</h${level}>`;});
body=body.replace(/<pre><code class="language-mermaid">([\s\S]*?)<\/code><\/pre>/g,(_,code)=>'<pre class="mermaid">'+code+'</pre>');
const existing=fs.readFileSync('docs/plans/design-intelligence-prd.html','utf8');
const css=existing.match(/<style>([\s\S]*?)<\/style>/)[1];
const html=`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>insrc Domain Ontology Builder PRD</title><style>${css}\n.mock-links{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}.mock-links a{border:1px solid var(--line);border-radius:5px;padding:10px 16px;background:var(--tint);font-size:14px;text-decoration:none;font-weight:650}.mermaid{overflow:auto;min-height:220px;background:#f6faf7;border:1px solid var(--line);border-radius:6px;padding:16px}.mermaid svg{display:block;margin:auto;max-width:100%}pre{overflow:auto}code{font-size:.87em;overflow-wrap:anywhere}table{table-layout:auto}main{overflow:hidden}nav a{display:block}nav a.active{background:var(--tint)}.screen-label{font-size:12px;color:var(--muted)}@media print{.mock-links{display:none}.mermaid{break-inside:avoid}}</style></head><body><a class="skip" href="#main">Skip to content</a><div class="layout"><aside><div class="brand">insrc</div><div class="label">Product requirements · draft</div><nav aria-label="Contents">${toc.map(t=>`<a href="#${t.id}">${t.title}</a>`).join('')}</nav></aside><main id="main"><div class="label eyebrow">Domain intelligence / ${md.match(/^Date: (.+)$/m)?.[1] ?? 'Draft'}</div><div class="mock-links"><a href="mocks/ontology-viewer.html">Open VS Code viewer mock ↗</a><a href="mocks/ontology-editor.html">Open VS Code editor mock ↗</a><a href="ontology-builder-prd.md">Markdown source</a></div>${body}<footer>Discussion draft · fictional examples · no implementation approval. Generated from ontology-builder-prd.md. Mermaid 10.9.1 is embedded for offline rendering.</footer></main></div>${script(runtime)}<script>mermaid.initialize({startOnLoad:true,securityLevel:'strict',theme:'base',themeVariables:{primaryColor:'#edf5f1',primaryTextColor:'#20372f',primaryBorderColor:'#42866e',lineColor:'#587566',clusterBkg:'#f6faf7',clusterBorder:'#bdcfc5',fontFamily:'system-ui'},flowchart:{htmlLabels:false}});</script></body></html>`;
fs.writeFileSync('docs/ontology-builder-prd.html',checkedHtml(html));
console.log(process.argv.includes('--prd-only')?'Updated HTML PRD.':'Created HTML PRD and two offline Mermaid-backed mocks.');
