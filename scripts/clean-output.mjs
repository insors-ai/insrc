import { rmSync } from 'node:fs';
// TypeScript does not remove output for deleted source files. A clean build must
// never leave a removed engine executable in the daemon's output directory.
rmSync(new URL('../out/', import.meta.url), { recursive: true, force: true });
