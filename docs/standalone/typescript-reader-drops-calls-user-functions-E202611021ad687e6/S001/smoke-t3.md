## Installed-daemon smoke (ISSUE-1ad687e6 S001 t3), 2026-11-03

Installed daemon updated to ca8b54c8 (the update skipped npm install: the install marker matched) and restarted.
Repository /tmp/insrc-builtin-smoke registered with repo.add:

```ts
// src/p.ts
export function parse(text: string): string { return text; }
// src/store.ts
export class Store { find(id: number): number { return id; } }
// src/main.ts
import { parse } from './p.js';
import { Store } from './store.js';
export function run(items: number[]): void { parse('x'); items.find(x => x > 0); }
export class Service { private store = new Store(); go(): void { this.store.find(1); } }
```

search.callers over the daemon IPC, by entity id (function `parse`, method `Store.find`):

After the first index:
```
parse <- ["run"]
find <- ["go"]
```

After repo.reindex (full index, lastIndexed 2026-11-03T08:38:55Z -> 08:39:52Z):
```
parse <- ["run"]
find <- ["go"]
```

Result: pass. A bare call to an imported user function named `parse` and a call on a new-initialised field to a user method named `find` are both callers; `items.find()` on an array is not a caller of `Store.find`. Before this Story both names were on the reader's built-in list, so neither call was recorded (the resolution test src/indexer/__tests__/builtin-named-calls-resolution.test.ts fails with the earlier reader).
