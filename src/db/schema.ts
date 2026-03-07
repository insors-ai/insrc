/**
 * SurrealDB schema DDL — run once on daemon startup via initDb().
 * All statements are idempotent (DEFINE … OVERWRITE).
 */
export const SCHEMA_STATEMENTS: string[] = [
  // -------------------------------------------------------------------------
  // Repo registry
  // -------------------------------------------------------------------------
  `DEFINE TABLE registered_repo SCHEMAFULL OVERWRITE`,
  `DEFINE FIELD path        ON registered_repo TYPE string OVERWRITE`,
  `DEFINE FIELD name        ON registered_repo TYPE string OVERWRITE`,
  `DEFINE FIELD addedAt     ON registered_repo TYPE string OVERWRITE`,
  `DEFINE FIELD lastIndexed ON registered_repo TYPE option<string> OVERWRITE`,
  `DEFINE FIELD status      ON registered_repo TYPE string OVERWRITE`,
  `DEFINE FIELD errorMsg    ON registered_repo TYPE option<string> OVERWRITE`,
  `DEFINE INDEX repo_path   ON registered_repo FIELDS path UNIQUE OVERWRITE`,

  // -------------------------------------------------------------------------
  // Entity nodes (functions, classes, interfaces, types, files, repos, modules)
  // -------------------------------------------------------------------------
  `DEFINE TABLE entity SCHEMAFULL OVERWRITE`,
  `DEFINE FIELD id             ON entity TYPE string OVERWRITE`,
  `DEFINE FIELD kind           ON entity TYPE string OVERWRITE`,
  `DEFINE FIELD name           ON entity TYPE string OVERWRITE`,
  `DEFINE FIELD language       ON entity TYPE string OVERWRITE`,
  `DEFINE FIELD repo           ON entity TYPE string OVERWRITE`,
  `DEFINE FIELD file           ON entity TYPE string OVERWRITE`,
  `DEFINE FIELD startLine      ON entity TYPE int OVERWRITE`,
  `DEFINE FIELD endLine        ON entity TYPE int OVERWRITE`,
  `DEFINE FIELD body           ON entity TYPE string OVERWRITE`,
  `DEFINE FIELD embedding      ON entity TYPE array<float> OVERWRITE`,
  `DEFINE FIELD indexedAt      ON entity TYPE string OVERWRITE`,
  `DEFINE FIELD isExported     ON entity TYPE option<bool> OVERWRITE`,
  `DEFINE FIELD isAsync        ON entity TYPE option<bool> OVERWRITE`,
  `DEFINE FIELD isAbstract     ON entity TYPE option<bool> OVERWRITE`,
  `DEFINE FIELD signature      ON entity TYPE option<string> OVERWRITE`,
  `DEFINE FIELD hash           ON entity TYPE option<string> OVERWRITE`,
  `DEFINE FIELD rootPath       ON entity TYPE option<string> OVERWRITE`,
  `DEFINE FIELD embeddingModel ON entity TYPE option<string> OVERWRITE`,

  // Vector index — 2048d for qwen3-embedding:0.6b
  `DEFINE INDEX entity_embedding ON entity FIELDS embedding MTREE DIMENSION 2048 OVERWRITE`,
  // BM25 full-text index for name search
  `DEFINE INDEX entity_name ON entity FIELDS name SEARCH ANALYZER ascii BM25 OVERWRITE`,
  // Composite index for file-scoped queries (used on delete/re-index)
  `DEFINE INDEX entity_file ON entity FIELDS file OVERWRITE`,
  // Composite index for repo-scoped queries
  `DEFINE INDEX entity_repo ON entity FIELDS repo OVERWRITE`,

  // -------------------------------------------------------------------------
  // Relation (edge) tables — all are entity → entity
  // -------------------------------------------------------------------------
  `DEFINE TABLE defines    TYPE RELATION IN entity OUT entity OVERWRITE`,
  `DEFINE TABLE imports    TYPE RELATION IN entity OUT entity OVERWRITE`,
  `DEFINE TABLE calls      TYPE RELATION IN entity OUT entity OVERWRITE`,
  `DEFINE TABLE inherits   TYPE RELATION IN entity OUT entity OVERWRITE`,
  `DEFINE TABLE implements TYPE RELATION IN entity OUT entity OVERWRITE`,
  `DEFINE TABLE depends_on TYPE RELATION IN entity OUT entity OVERWRITE`,
  `DEFINE TABLE exports    TYPE RELATION IN entity OUT entity OVERWRITE`,
  `DEFINE TABLE references TYPE RELATION IN entity OUT entity OVERWRITE`,
];
