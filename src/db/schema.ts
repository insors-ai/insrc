/**
 * Kuzu schema DDL — run once on daemon startup via initDb().
 * All statements use IF NOT EXISTS for idempotency.
 *
 * Entity data (body, embeddings, etc.) lives in LanceDB — see entities.ts.
 * Kuzu stores lightweight stub nodes for graph traversal and the repo registry.
 */
export const KUZU_STATEMENTS: string[] = [
  // Entity stub nodes — minimal; full entity data lives in LanceDB 'entities' table.
  'CREATE NODE TABLE IF NOT EXISTS Entity(id STRING, kind STRING, PRIMARY KEY(id))',

  // Repo registry
  `CREATE NODE TABLE IF NOT EXISTS Repo(
    id          STRING,
    path        STRING,
    name        STRING,
    addedAt     STRING,
    lastIndexed STRING,
    status      STRING,
    errorMsg    STRING,
    PRIMARY KEY(id)
  )`,

  // Relation tables — all edges are between Entity stub nodes
  'CREATE REL TABLE IF NOT EXISTS DEFINES(FROM Entity TO Entity)',
  'CREATE REL TABLE IF NOT EXISTS IMPORTS(FROM Entity TO Entity)',
  'CREATE REL TABLE IF NOT EXISTS CALLS(FROM Entity TO Entity)',
  'CREATE REL TABLE IF NOT EXISTS INHERITS(FROM Entity TO Entity)',
  'CREATE REL TABLE IF NOT EXISTS IMPLEMENTS(FROM Entity TO Entity)',
  'CREATE REL TABLE IF NOT EXISTS DEPENDS_ON(FROM Entity TO Entity)',
  'CREATE REL TABLE IF NOT EXISTS EXPORTS(FROM Entity TO Entity)',
  'CREATE REL TABLE IF NOT EXISTS REFERENCES(FROM Entity TO Entity)',

  // Plan graph — persistent across sessions, NOT subject to TTL pruning
  `CREATE NODE TABLE IF NOT EXISTS Plan(
    id        STRING,
    repoPath  STRING,
    title     STRING,
    status    STRING,
    createdAt STRING,
    updatedAt STRING,
    PRIMARY KEY(id)
  )`,

  `CREATE NODE TABLE IF NOT EXISTS PlanStep(
    id          STRING,
    planId      STRING,
    idx         INT32,
    title       STRING,
    description STRING,
    checkpoint  BOOLEAN,
    status      STRING,
    complexity  STRING,
    fileHint    STRING,
    notes       STRING,
    createdAt   STRING,
    updatedAt   STRING,
    startedAt   STRING,
    doneAt      STRING,
    PRIMARY KEY(id)
  )`,

  'CREATE REL TABLE IF NOT EXISTS CONTAINS(FROM Plan TO PlanStep)',
  'CREATE REL TABLE IF NOT EXISTS STEP_DEPENDS_ON(FROM PlanStep TO PlanStep)',
];
