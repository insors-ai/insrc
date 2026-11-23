// Embedded verbatim by render-installer-bootstrap.mjs. Only runs after archive digest verification.
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const [mode, stage, destination, os, arch] = process.argv.slice(1);
if (process.version !== 'v22.22.1' || process.platform !== os || process.arch !== arch) throw Error('runtime-invalid: exact private runtime target required');
function entries(root, dir = '') {
  return fs.readdirSync(path.join(root, dir)).sort().flatMap(name => {
    const rel = path.join(dir, name), stat = fs.lstatSync(path.join(root, rel));
    if (stat.isSymbolicLink() || (!stat.isDirectory() && !stat.isFile())) throw Error('runtime-invalid: special file');
    return stat.isDirectory() ? entries(root, rel) : [rel];
  });
}
function present(file) { try { fs.lstatSync(file); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function verifyExisting() {
  if (!fs.lstatSync(destination).isDirectory() || fs.lstatSync(destination).isSymbolicLink()) throw Error('runtime-invalid: unsafe destination');
  const files = entries(stage), existing = entries(destination);
  if (JSON.stringify(files) !== JSON.stringify(existing) || files.some(file => digest(path.join(stage, file)) !== digest(path.join(destination, file)))) throw Error('runtime-invalid: immutable publication differs');
}
if (mode === 'runtime') {
  const npm = os === 'win32' ? 'node_modules/npm/package.json' : 'lib/node_modules/npm/package.json';
  if (JSON.parse(fs.readFileSync(path.join(stage, npm), 'utf8')).version !== '10.9.4') throw Error('runtime-invalid: matching npm required');
}
entries(stage);
let ancestor = path.dirname(destination);
while (true) {
  if (present(ancestor)) {
    const stat = fs.lstatSync(ancestor);
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw Error('runtime-invalid: unsafe ancestor');
  }
  const parent = path.dirname(ancestor); if (parent === ancestor) break; ancestor = parent;
}
fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
if (present(destination)) verifyExisting();
else {
  try { fs.renameSync(stage, destination); }
  catch (error) { if (!present(destination)) throw error; verifyExisting(); }
}
