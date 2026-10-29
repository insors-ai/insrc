"""Frozen Node22 build/full-sweep evidence. Run only after t1-t23 validation."""
import datetime, glob, hashlib, json, os, pathlib, re, signal, subprocess, sys, tempfile, time
repo=pathlib.Path('/Users/subhagho/work/projects/insors/insrc')
evidence=repo/'docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S004/evidence/t24'
commit='7ffa301c2d60b89098741190449560f68d8b2c2a'
node='/opt/homebrew/opt/node@22/bin/node'
now=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
write=lambda name,value:(evidence/name).write_text(json.dumps(value,indent=2)+'\n')
snapshot=pathlib.Path(tempfile.mkdtemp(prefix='cm-s4-sweep-20261029-',dir='/private/tmp'))
subprocess.run(['git','worktree','add','--detach',str(snapshot),commit],cwd=repo,check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
os.symlink(repo/'node_modules',snapshot/'node_modules',target_is_directory=True)
env=os.environ.copy();env['PATH']=str(pathlib.Path(node).parent)+os.pathsep+env.get('PATH','')
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=snapshot).decode().split('\0');tracked=[p for p in tracked if p]
def manifest():
 result={}
 for name in tracked:
  path=snapshot/name
  if not path.exists() and not path.is_symlink():result[name]={'missing':True};continue
  data=os.readlink(path).encode() if path.is_symlink() else path.read_bytes()
  result[name]={'sha256':hashlib.sha256(data).hexdigest(),'mode':oct(path.lstat().st_mode & 0o177777)}
 return result
before=manifest();write('tracked-before.json',before)
files=sorted(str(pathlib.Path(p).relative_to(snapshot)) for p in glob.glob(str(snapshot/'src/**/__tests__/*.test.ts'),recursive=True))
write('test-files.json',files)
argv=[node,'--import','tsx','--test','--test-reporter=tap',*files]
record={'version':1,'requestedAt':now(),'snapshotCommit':commit,'snapshotTree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=snapshot,text=True).strip(),'snapshotPath':str(snapshot),'dependencyPath':str(repo/'node_modules'),'runtime':node,'node':subprocess.check_output([node,'--version'],text=True).strip(),'evidenceDir':str(evidence),'status':'building','testFileCount':len(files),'requestedCommand':"npx tsx --test 'src/**/__tests__/*.test.ts' with Node22 on PATH",'argv':argv,'liveTestsEnvironment':{key:env.get(key) for key in ['INSRC_LIVE_TESTS','INSRC_MODE']},'codeReviewRequested':False,'daemonRestarted':False,'countsAdjustedForReruns':False}
write('run.json',record);print(json.dumps({'phase':'build','snapshot':str(snapshot),'commit':commit,'testFiles':len(files)}),flush=True)
with (evidence/'build.txt').open('wb') as log:
 build=subprocess.run(['npm','run','build'],cwd=snapshot,env=env,stdout=log,stderr=subprocess.STDOUT)
record['buildExitCode']=build.returncode;record['buildLogSha256']=hashlib.sha256((evidence/'build.txt').read_bytes()).hexdigest()
if build.returncode:
 record['status']='build-failed';record['finishedAt']=now();write('run.json',record);sys.exit(build.returncode)
record['status']='testing';record['startedAt']=now()
with (evidence/'sweep.tap').open('wb') as log:
 child=subprocess.Popen(argv,cwd=snapshot,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 record['pid']=child.pid;write('run.json',record);print(json.dumps({'phase':'testing','pid':child.pid,'testFiles':len(files)}),flush=True)
 try:code=child.wait(timeout=1500);record['outerTimeout']=False
 except subprocess.TimeoutExpired:
  record['outerTimeout']=True;os.killpg(child.pid,signal.SIGTERM)
  try:code=child.wait(timeout=30)
  except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL);code=child.wait()
record['exitCode']=code;record['finishedAt']=now();record['status']='completed' if not record['outerTimeout'] else 'timed-out'
text=(evidence/'sweep.tap').read_text(errors='replace');counts={}
for key in ['tests','suites','pass','fail','cancelled','skipped','todo','duration_ms']:
 hits=re.findall(r'^# '+key+r' ([0-9.]+)\s*$',text,re.M)
 if hits:counts[key]=float(hits[-1]) if '.' in hits[-1] else int(hits[-1])
record['counts']=counts;record['failureTitles']=re.findall(r'^not ok \d+ - (.*)$',text,re.M)
after=manifest();write('tracked-after.json',after);record['sourceDrift']=[p for p in tracked if before[p]!=after[p]]
record['gitStatusAfter']=subprocess.check_output(['git','status','--short'],cwd=snapshot,text=True);record['logSha256']=hashlib.sha256((evidence/'sweep.tap').read_bytes()).hexdigest()
write('run.json',record);print(json.dumps({'phase':record['status'],'exitCode':code,'counts':counts,'sourceDrift':record['sourceDrift']}),flush=True)
sys.exit(0 if code==0 and not record['sourceDrift'] else 1)
