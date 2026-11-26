// Embedded verbatim by the terminal renderer, after OS verification of Node and
// control bytes. This exact child owns publication only, never installation.
const path = require('node:path'), { pathToFileURL } = require('node:url');
const [home, identity, work, control, bootstrapHash, nativeHash] = process.argv.slice(1);
import(pathToFileURL(path.join(control, 'bootstrap.mjs')).href)
  .then(module => module.terminalMain(['--bootstrap-publication', home, identity, work, bootstrapHash, nativeHash]))
  .catch(error => { process.stderr.write(`bootstrap-failed: ${error.message}\n`); process.exit(1); });
