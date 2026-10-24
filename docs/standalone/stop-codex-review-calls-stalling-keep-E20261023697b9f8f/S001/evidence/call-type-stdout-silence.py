import json,glob,re,collections,os,datetime as dt
os.chdir(os.path.expanduser('~/.codex/sessions/2026/10'))
def ts(s): return dt.datetime.fromisoformat(s.replace('Z','+00:00'))
MAP=[('DEF review: verify one claim','You are a grounded reviewer'),
 ('DEF review: extract claims','You audit a workflow artifact by extracting'),
 ('HLD/LLD review: reviewer session','You review a design document against a FIXED checklist'),
 ('code review: adherence evidence gather','gathering evidence on ADHERENCE'),
 ('code review: judges (4 dimensions)','judging (ADHERENCE|QUALITY|CONVENTIONS|COVERAGE)'),
 ('build: validation verdict session','# Build validation gate')]
# Session events that codex also prints on stdout with --json: tool calls (item.started), tool outputs
# (item.completed), assistant messages (item.completed agent_message) and the end of the turn.
STDOUT_TYPES={'function_call','custom_tool_call','mcp_tool_call','function_call_output','custom_tool_call_output','local_shell_call','task_complete','task_started'}
R=collections.defaultdict(list)
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
    if tc is None or tc.get('error'): continue
    pts=[ts(l['timestamp']) for l in L if 'timestamp' in l and (l.get('payload',{}).get('type') in STDOUT_TYPES or (l.get('payload',{}).get('type')=='message' and l['payload'].get('role')=='assistant'))]
    pts.sort()
    gaps=[(pts[i+1]-pts[i]).total_seconds() for i in range(len(pts)-1)] or [0]
    R[kind].append(max(gaps))
print(f"{'call type':40}{'healthy calls':>14}{'p99 stdout silence':>20}{'max':>8}")
for k,_ in MAP:
    g=sorted(R.get(k,[]))
    if g: print(f"{k:40}{len(g):14}{g[min(len(g)-1,int(len(g)*.99))]:20.0f}{g[-1]:8.0f}")
