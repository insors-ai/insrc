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
];
