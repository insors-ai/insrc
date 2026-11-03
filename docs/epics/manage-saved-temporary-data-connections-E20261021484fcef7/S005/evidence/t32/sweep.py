import concurrent.futures, hashlib, json, os, pathlib, re, shutil, signal, subprocess, sys, tempfile, time, xml.etree.ElementTree as ET
origin=pathlib.Path(sys.argv[1]).resolve(); base=pathlib.Path(tempfile.mkdtemp(prefix='s5-frozen-',dir='/private/tmp')); root=base/'repo'; evidence=base/'evidence'; evidence.mkdir(); home=base/'home';home.mkdir(); artifacts=base/'artifacts';artifacts.mkdir()
node='/opt/homebrew/opt/node@22/bin/node'; npm='/opt/homebrew/opt/node@22/bin/npm'
sha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=origin,text=True).strip()
subprocess.run(['git','clone','--quiet','--shared','--no-hardlinks',str(origin),str(root)],check=True)
subprocess.run(['git','checkout','--quiet','--detach',sha],cwd=root,check=True)
for relative in ['node_modules','vscode-plugin/node_modules']:
 target=origin/relative
 if target.exists():(root/relative).symlink_to(target.resolve(),target_is_directory=True)
env=dict(os.environ);env.update(HOME=str(home),GRADLE_USER_HOME=str(pathlib.Path.home()/'.gradle'),INSRC_DAEMON_ROOT=str(home/'.insrc/daemon'),INSRC_LOG_LEVEL='error',INSRC_FIXTURE_NODE=node,INSRC_NODE22=node)
env['PATH']=str(pathlib.Path(node).parent)+':'+env.get('PATH','');env.pop('INSRC_LIVE_TESTS',None);env.pop('INSRC_REPO',None);env.pop('NODE_TEST_CONTEXT',None);env.pop('NODE_CHANNEL_FD',None)
env['JAVA_HOME']=subprocess.check_output(['/usr/libexec/java_home','-v','21'],text=True).strip();env['JAVA_TOOL_OPTIONS']='-Duser.home='+str(home)
tracked=subprocess.check_output(['git','ls-files','-z'],cwd=root).decode().split('\0');tracked=[f for f in tracked if f]
def hashes():return {f:hashlib.sha256((root/f).read_bytes()).hexdigest() if (root/f).is_file() else None for f in tracked}
initial=hashes();backend=sorted(str(p.relative_to(root)) for p in (root/'src').rglob('*.test.ts') if '__tests__' in p.parts);extension=sorted(str(p.relative_to(root)) for p in (root/'vscode-plugin/src').rglob('*.test.ts') if '__tests__' in p.parts)
serial=[f for f in backend if re.search(r'gradle|runConnectionJUnit|jetbrains-plugin',(root/f).read_text(),re.I)];parallel=[f for f in backend if f not in serial]
report={'sourceCommit':sha,'tree':subprocess.check_output(['git','rev-parse','HEAD^{tree}'],cwd=root,text=True).strip(),'snapshot':str(root),'origin':str(origin),'node':subprocess.check_output([node,'--version'],text=True).strip(),'javaHome':env['JAVA_HOME'],'isolatedHome':str(home),'liveServices':'not enabled','releaseEnabled':False,'manualAcceptance':'pending-user','backendFiles':backend,'extensionFiles':extension,'serialNativeBridgeFiles':serial,'results':[],'sourceHashes':initial}
(evidence/'manifest.json').write_text(json.dumps(report,indent=2)+'\n');(origin/'docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t32').mkdir(parents=True,exist_ok=True);(origin/'docs/epics/manage-saved-temporary-data-connections-E20261021484fcef7/S005/evidence/t32/run-location.txt').write_text(str(base)+'\n')
print(json.dumps({'snapshot':str(root),'commit':sha,'backend':len(backend),'extension':len(extension),'serial':len(serial)}),flush=True)
def progress(phase,**rest):(evidence/'progress.json').write_text(json.dumps({'phase':phase,'time':time.time(),**rest},indent=2)+'\n')
def run(name,cmd,cwd=None,timeout=660):
 output=evidence/(name+'.txt');start=time.time();timed=False;intervention=[]
 with output.open('wb') as log:
  p=subprocess.Popen(cmd,cwd=cwd or root,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:code=p.wait(timeout=timeout)
  except subprocess.TimeoutExpired:
   timed=True;intervention.append('SIGTERM to owned process group after timeout');os.killpg(p.pid,signal.SIGTERM)
   try:code=p.wait(timeout=10)
   except subprocess.TimeoutExpired:intervention.append('SIGKILL to same owned process group');os.killpg(p.pid,signal.SIGKILL);code=p.wait()
 text=output.read_text(errors='replace');counts={}
 for key in ['tests','pass','fail','cancelled','skipped','todo']:
  found=re.findall(r'^# '+key+r' (\d+)\s*$',text,re.M)
  if found:counts[key]=int(found[-1])
 r={'name':name,'command':cmd,'cwd':str(cwd or root),'exitCode':code,'timedOut':timed,'durationSeconds':round(time.time()-start,2),'output':output.name,'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'counts':counts,'failures':re.findall(r'^\s*not ok \d+ - (.+)$',text,re.M),'interventions':intervention}
 return r
progress('fresh builds')
for name,cmd,cwd in [('backend-build',[npm,'run','build'],root),('extension-typecheck',[node,'../node_modules/typescript/bin/tsc','--noEmit'],root/'vscode-plugin'),('extension-bundle',[node,'esbuild.mjs'],root/'vscode-plugin')]:
 r=run(name,cmd,cwd,300);report['results'].append(r);print(name,r['exitCode'],flush=True)
def suites(files,phase,workers):
 progress(phase,total=len(files),completed=0);results=[]
 def one(file):return run(phase+'-'+file.replace('/','_'),[node,'--import','tsx','--test','--test-reporter=tap','--test-timeout=600000',file])
 with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as pool:
  jobs={pool.submit(one,file):file for file in files}
  for future in concurrent.futures.as_completed(jobs):
   r=future.result();r['file']=jobs[future];results.append(r);progress(phase,total=len(files),completed=len(results),failed=sum(x['exitCode']!=0 for x in results));
   if r['exitCode']!=0 or len(results)%25==0:print(phase,len(results),'/',len(files),r['file'],'exit',r['exitCode'],flush=True)
 results.sort(key=lambda r:r['file']);report['results']+=results;(evidence/(phase+'-results.json')).write_text(json.dumps(results,indent=2)+'\n')
suites(parallel,'backend',4);suites(serial,'native-bridges',1);suites(extension,'extension',4)
gradle=['./gradlew','--offline','--no-daemon','--no-build-cache','-Pkotlin.compiler.execution.strategy=in-process','-Pkotlin.incremental=false']
progress('full JetBrains test/build')
r=run('jetbrains-test-build',gradle+['test','build','--rerun-tasks','--console=plain'],root/'jetbrains-plugin',1800);report['results'].append(r);print(r['name'],r['exitCode'],flush=True)
xmls=list((root/'jetbrains-plugin/build/test-results/test').glob('TEST-*.xml'));native=[]
for f in xmls:
 try:
  x=ET.parse(f).getroot();native.append({'name':x.attrib.get('name'),'tests':int(x.attrib.get('tests','0')),'failures':int(x.attrib.get('failures','0')),'errors':int(x.attrib.get('errors','0')),'skipped':int(x.attrib.get('skipped','0'))});shutil.copy2(f,evidence/f.name)
 except Exception as error:native.append({'file':f.name,'parseError':str(error)})
report['nativeJUnit']=native
progress('plugin verification')
r=run('jetbrains-plugin-verifier',gradle+['verifyPlugin','--console=plain'],root/'jetbrains-plugin',900);report['results'].append(r);print(r['name'],r['exitCode'],flush=True)
progress('package plugins')
vsce='/Users/subhagho/.npm/_npx/e0e6bcac20bfabcb/node_modules/@vscode/vsce/vsce'
version=json.loads((root/'vscode-plugin/package.json').read_text())['version'];vsix=artifacts/('insrc-vscode-'+version+'-s005-'+sha[:9]+'.vsix')
r=run('vscode-vsix',[node,vsce,'package','--no-dependencies','--out',str(vsix)],root/'vscode-plugin',300);report['results'].append(r);print(r['name'],r['exitCode'],flush=True)
r=run('jetbrains-package',gradle+['buildPlugin','--console=plain'],root/'jetbrains-plugin',600);report['results'].append(r);print(r['name'],r['exitCode'],flush=True)
version=re.search(r'^pluginVersion\s*=\s*(\S+)',(root/'jetbrains-plugin/gradle.properties').read_text(),re.M)[1];jar=root/('jetbrains-plugin/build/distributions/insrc-jetbrains-'+version+'.zip')
if jar.exists():shutil.copy2(jar,artifacts/('insrc-jetbrains-'+version+'-s005-'+sha[:9]+'.zip'))
report['sourceDrift']=[f for f,digest in hashes().items() if digest!=initial[f]];report['packages']=[{'name':p.name,'path':str(p),'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'bytes':p.stat().st_size} for p in sorted(artifacts.iterdir())]
report['allExecutedChecksPassed']=all(r['exitCode']==0 and not r['timedOut'] for r in report['results']) and not report['sourceDrift'];report['releaseEnabled']=False
(evidence/'report.json').write_text(json.dumps(report,indent=2)+'\n');progress('complete',allExecutedChecksPassed=report['allExecutedChecksPassed'],packages=len(report['packages']))
print(json.dumps({'done':True,'report':str(evidence/'report.json'),'allExecutedChecksPassed':report['allExecutedChecksPassed'],'packages':report['packages'],'sourceDrift':report['sourceDrift']}),flush=True)
