// Native TS stripping does not resolve this repo's NodeNext .js imports to .ts.
import { tsImport } from 'tsx/esm/api';
await tsImport('./step-state-worker.ts', import.meta.url);
