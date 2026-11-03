"""Compact reproducible source fingerprint; keep the per-file map in temp only."""
import datetime
import hashlib
import json
import pathlib
import subprocess
import sys

root = pathlib.Path.cwd()
files = set()
for base in ['src', 'packages/project-memory/src', 'scripts']:
    for path in (root / base).rglob('*'):
        if (path.is_file() or path.is_symlink()) and 'node_modules' not in path.parts:
            files.add(path.relative_to(root).as_posix())
for path in ['package.json', 'package-lock.json', 'tsconfig.json', '.npmrc', 'copy-assets.mjs',
             'packages/project-memory/package.json', 'packages/project-memory/tsconfig.json',
             '.github/workflows/project-memory.yml']:
    files.add(path)
hashes = {}
for name in sorted(files):
    path = root / name
    data = ('symlink:' + str(path.readlink())).encode() if path.is_symlink() else path.read_bytes()
    hashes[name] = hashlib.sha256(data).hexdigest()
digest = hashlib.sha256(json.dumps(hashes, sort_keys=True, separators=(',', ':')).encode()).hexdigest()
baseline = pathlib.Path(sys.argv[2])
changes = []
if baseline.exists():
    old = json.loads(baseline.read_text())
    changes = [name for name in sorted(set(old) | set(hashes)) if old.get(name) != hashes.get(name)]
else:
    baseline.write_text(json.dumps(hashes, sort_keys=True))
contract_root = root / 'docs/epics/share-project-memory-across-agents-applications-E2026110117123b6d'
contracts = {}
for path in [contract_root / 'HLD.md', contract_root / 'S003/LLD.md', contract_root / 'S003/PLAN.md']:
    contracts[path.relative_to(root).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
result = {
    'capturedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'head': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
    'sourceDigest': digest, 'fileCount': len(hashes), 'changedFromBaseline': changes,
    'contracts': contracts,
    'dirtyTrackedPaths': subprocess.check_output(['git', 'diff', '--name-only'], text=True).splitlines(),
    'scope': 'src, standalone package src, scripts, manifests, compiler/npm config and qualification workflow; generated output and mutable workflow records excluded',
}
pathlib.Path(sys.argv[1]).write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps({'sourceDigest': digest, 'fileCount': len(hashes), 'changed': changes}))
