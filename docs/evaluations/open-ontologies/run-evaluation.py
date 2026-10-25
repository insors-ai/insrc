import subprocess,json,time,pathlib,os
import argparse,tempfile
parser=argparse.ArgumentParser(description='Isolated Open Ontologies CLI evaluation; binary must already be downloaded and verified.')
parser.add_argument('--binary',required=True);opts=parser.parse_args()
f=pathlib.Path(__file__).resolve().parent/'fixtures';tmp=pathlib.Path(tempfile.mkdtemp(prefix='insrc-oo-eval-'));b=pathlib.Path(opts.binary).resolve();results=[]
def run(name,args,stdin=None):
 start=time.monotonic();p=subprocess.run([str(b),'--no-connect','--data-dir',str(tmp/name),*args],input=stdin,text=True,capture_output=True,timeout=30);r=dict(name=name,args=args,exitCode=p.returncode,seconds=round(time.monotonic()-start,3),stdout=p.stdout,stderr=p.stderr);results.append(r);print(name,p.returncode);return r
run('syntax-valid',['validate',str(f/'base.ttl')])
run('syntax-invalid',['validate','-'],'@prefix ex: <urn:bad:> . ex:broken [')
run('shacl',['batch','-'],f'load {f}/base.ttl\nshacl {f}/shapes.ttl\n')
run('reasoning',['batch','-'],f'load {f}/base.ttl\nreason --profile rdfs\nquery "ASK {{ <urn:insrc:eval:one> a <urn:insrc:eval:Party> }}"\n')
run('graphs',['batch','-'],f'load {f}/provenance.trig\nquery "SELECT ?g ?value WHERE {{ GRAPH ?g {{ <urn:insrc:eval:Customer> <urn:insrc:eval:domain> ?value }} }}"\n')
run('scope',['batch','-'],f'load {f}/provenance.trig\nquery "SELECT ?value WHERE {{ GRAPH <urn:insrc:eval:accepted> {{ <urn:insrc:eval:Customer> <urn:insrc:eval:domain> ?value }} }}"\n')
run('plan',['batch','-'],f'load {f}/base.ttl\nplan {f}/base.ttl\n')
run('separate-process',['stats'])
run('verified-unavailable',['batch','-'],f'load {f}/base.ttl\nshacl {f}/shapes.ttl --verified\n')

run('state-union',['batch','-'],f'load {f}/state-leak.trig\nshacl {f}/shapes.ttl\n')
run('fragment-plan',['batch','-'],f'load {f}/base.ttl\nplan {f}/candidate-fragment.ttl\n')
large=tmp/'large.ttl';large.write_text('@prefix ex: <urn:insrc:eval:> .\n'+''.join(f'ex:e{i} a ex:Entity ; ex:module "module{i%20}" ; ex:name "Entity {i}" .\n' for i in range(10000)))
run('large-smoke',['batch','-'],f'load {large}\nquery "SELECT ?s WHERE {{ ?s <urn:insrc:eval:module> \\\"module3\\\" }} LIMIT 25"\n')
(tmp/'results.json').write_text(json.dumps(results,indent=2))
print('Results:',tmp/'results.json')
