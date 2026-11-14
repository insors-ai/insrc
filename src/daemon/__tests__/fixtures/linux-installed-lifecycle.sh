#!/usr/bin/env bash
set -euo pipefail
source_root="$1"
scratch=$(mktemp -d /tmp/insrc-linux-install-XXXXXXXX)
export HOME="$scratch/home" INSRC_CTL_LOG_DIR="$scratch/logs"
origin="$scratch/origin"
target="$HOME/.insrc/daemon"
export INSRC_DAEMON_ROOT="$target"
trap 'if [ -f "$HOME/.insrc/daemon.pid" ]; then node "$target/out/bin/insrc-daemon-control.js" 30 || true; fi; rm -rf "$scratch"' EXIT
mkdir -p "$HOME" "$origin/scripts"
mkdir -p "$origin/src/assets/models"
cp "$source_root/src/assets/models/cloud-model-catalog.json" "$origin/src/assets/models/cloud-model-catalog.json"
cp "$source_root/scripts/daemon-ctl.sh" "$origin/scripts/daemon-ctl.sh"
cat > "$origin/package.json" <<'JSON'
{"name":"linux-lifecycle-fixture","version":"1.0.0","scripts":{"build":"bash build.sh"}}
JSON
cat > "$origin/package-lock.json" <<'JSON'
{"name":"linux-lifecycle-fixture","version":"1.0.0","lockfileVersion":3,"packages":{"":{"name":"linux-lifecycle-fixture","version":"1.0.0"}}}
JSON
printf 'out/\nnode_modules/\n' > "$origin/.gitignore"
cat > "$origin/daemon.cjs" <<'JS'
const fs = require('node:fs');
const net = require('node:net');
const root = process.env.HOME + '/.insrc';
const socket = root + '/daemon.sock';
const pidFile = root + '/daemon.pid';
const server = net.createServer(connection => connection.on('data', line => {
  const request = JSON.parse(line);
  if (request.method === 'daemon.shutdown') {
    fs.rmSync(pidFile, {force:true});
    connection.end(JSON.stringify({id:request.id,result:{ok:true}}) + '\n');
    server.close(() => process.exit(0));
  } else {
    connection.end(JSON.stringify({id:request.id,result:{pid:process.pid}}) + '\n');
  }
}));
server.listen(socket, () => fs.writeFileSync(pidFile, String(process.pid)));
JS
cat > "$origin/control.cjs" <<'JS'
const fs = require('node:fs');
const net = require('node:net');
const root = process.env.HOME + '/.insrc';
const endpoint = root + '/daemon.sock';
if (!fs.existsSync(endpoint)) process.exit(0);
const connection = net.createConnection(endpoint, () => connection.write('{"id":1,"method":"daemon.shutdown"}\n'));
connection.on('data', () => {});
connection.on('error', error => { console.error(error); process.exitCode = 1; });
connection.on('close', () => {
  const timeout = Date.now() + 3000;
  const wait = setInterval(() => {
    if (!fs.existsSync(endpoint)) { clearInterval(wait); return; }
    if (Date.now() > timeout) { process.exitCode = 1; clearInterval(wait); }
  }, 20);
});
JS
cat > "$origin/build.sh" <<'BASH'
set -euo pipefail
mkdir -p out/bin out/daemon node_modules/tsx
cp daemon.cjs out/daemon/index.js
cp control.cjs out/bin/insrc-daemon-control.js
printf '{"exports":{"./esm":"./esm.mjs"}}\n' > node_modules/tsx/package.json
printf 'export {};\n' > node_modules/tsx/esm.mjs
BASH
git -C "$origin" init -q -b main
git -C "$origin" config user.name 'insrc Linux fixture'
git -C "$origin" config user.email tests@example.invalid
git -C "$origin" add .
git -C "$origin" commit -qm 'initial fixture release'
bash "$source_root/scripts/insrc-daemon-install.sh" --repo "$origin" --branch main --embedder onnx -y
before=$(cat "$HOME/.insrc/daemon.pid")
test -S "$HOME/.insrc/daemon.sock"
test ! -e "$HOME/.insrc/managed-lifecycle/installation.json"
printf 'updated\n' > "$origin/version.txt"
git -C "$origin" add version.txt
git -C "$origin" commit -qm 'next fixture release'
bash "$target/scripts/daemon-ctl.sh" update
test "$(cat "$HOME/.insrc/daemon.pid")" = "$before"
test "$(git -C "$target" rev-parse HEAD)" = "$(git -C "$origin" rev-parse HEAD)"
bash "$target/scripts/daemon-ctl.sh" restart --skip-sync --skip-install --skip-build
after=$(cat "$HOME/.insrc/daemon.pid")
test "$before" != "$after"
test -S "$HOME/.insrc/daemon.sock"
bash "$target/scripts/daemon-ctl.sh" stop
test ! -e "$HOME/.insrc/daemon.sock"
printf 'verified Linux install, update without restart, ordinary restart and stop\n'
