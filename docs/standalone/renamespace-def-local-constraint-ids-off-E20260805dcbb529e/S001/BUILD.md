# Build (standalone small) — Story S001

**Size class:** small  ·  **Standalone:** yes  ·  **Created:** 2026-08-05T10:41:11.660Z

## Scope

Renamespace DEF local-constraint ids off the citation c-namespace: localConstraints[].id ^c\d+$ -> ^lc\d+$ (schemas.ts) + align the define runner prompt guidance (define/index.ts) so new DEFs mint lcN ids; source stays ^c\d+$. Going-forward only; existing DEFs unmigrated. Tests: schema accepts lc/rejects c + source stays c; validateCitations ignores lc/k refs but still fails dangling c-refs; renderer renders lc-local-constraint with its source citation.
