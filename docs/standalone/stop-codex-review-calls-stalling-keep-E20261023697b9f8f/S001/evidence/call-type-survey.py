import json,glob,re,collections,os,datetime as dt
os.chdir(os.path.expanduser('~/.codex/sessions/2026/10'))
def ts(s): return dt.datetime.fromisoformat(s.replace('Z','+00:00'))
MAP=[('DEF review: verify one claim','You are a grounded reviewer'),
 ('DEF review: extract claims','You audit a workflow artifact by extracting'),
 ('HLD/LLD review: reviewer session','You review a design document against a FIXED checklist'),
 ('code review: adherence evidence gather','gathering evidence on ADHERENCE'),
 ('code review: judges (4 dimensions)','judging (ADHERENCE|QUALITY|CONVENTIONS|COVERAGE)'),
 ('build: validation verdict session','# Build validation gate'),
 ('analyze: exploration decomposer','exploration decomposer'),
 ('workflow: open design question','OPEN DESIGN QUESTION'),
 ('brainstorm drafter','DRAFTER for the `brainstorm`'),
 ('schema/format probes','Schema probe|checking an answer format|This is a schema p'),
]
R=collections.defaultdict(list); errs=collections.defaultdict(collections.Counter)
for f in glob.glob('*/rollout-*.jsonl'):
    try: L=[json.loads(l) for l in open(f) if l.strip()]
    except Exception: continue
    meta=next((l['payload'] for l in L if l.get('type')=='session_meta'),{})
    if meta.get('source')!='exec' or meta.get('cwd','').startswith(('/tmp','/private/tmp')): continue
    msgs=[''.join(c.get('text','') for c in l['payload'].get('content',[]) if isinstance(c,dict)) for l in L if l.get('payload',{}).get('type')=='message' and l['payload'].get('role')=='user']
    task=next((m for m in msgs if not m.startswith(('# AGENTS.md','<environment_context','<permissions','<recommended_plugins'))),'')
    kind=next((k for k,rx in MAP if re.search(rx,task[:400])),None)
    if kind is None: continue
    tc=next((l['payload'] for l in L if l.get('payload',{}).get('type')=='task_complete'),None)
    t=[ts(l['timestamp']) for l in L if 'timestamp' in l]
    gaps=[(t[i+1]-t[i]).total_seconds() for i in range(len(t)-1)] or [0]
    if tc is None: out='no-finish'
    elif tc.get('error'): out='error'; errs[kind][re.sub(r'\s+',' ',json.dumps(tc['error']))[:110]]+=1
    else: out='ok'
    R[kind].append(dict(out=out,dur=(t[-1]-t[0]).total_seconds(),gap=max(gaps),day=f[:2]))
def p(d,q): return d[min(len(d)-1,int(len(d)*q))] if d else float('nan')
print(f"{'call type':40}{'calls':>6}{'ok':>6}{'error':>6}{'no-finish':>10}{'rate':>7} | ok: {'med':>5}{'p95':>5}{'p99':>5}{'max':>5} | silence(ok) max | no-finish last event med/max")
for k,_ in MAP:
    v=R.get(k,[])
    if not v: continue
    ok=sorted(x['dur'] for x in v if x['out']=='ok'); g=sorted(x['gap'] for x in v if x['out']=='ok')
    nf=sorted(x['dur'] for x in v if x['out']=='no-finish'); er=sum(1 for x in v if x['out']=='error')
    print(f"{k:40}{len(v):6}{len(ok):6}{er:6}{len(nf):10}{100*len(nf)/len(v):6.1f}% | {p(ok,.5):9.0f}{p(ok,.95):5.0f}{p(ok,.99):5.0f}{(ok[-1] if ok else float('nan')):5.0f} | {(g[-1] if g else float('nan')):15.0f} | {p(nf,.5):.0f}/{(nf[-1] if nf else float('nan')):.0f} s")
print()
for k,c in errs.items():
    for e,n in c.most_common(3): print(f"ERROR {k}: {n}x {e}")
