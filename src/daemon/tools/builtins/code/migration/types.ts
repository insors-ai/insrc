/**
 * Shared types for the `code_migration_walk` tool's per-tool
 * walkers (code-analyzer-skills.md Phase 0.5).
 */

export type MigrationTool =
	| 'flyway'
	| 'liquibase'
	| 'knex'
	| 'prisma-migrate'
	| 'alembic'
	| 'rails'
	| 'django';

export type OpKind =
	| 'create_table'
	| 'drop_table'
	| 'add_column'
	| 'drop_column'
	| 'alter_column'
	| 'add_index'
	| 'drop_index'
	| 'rename_table'
	| 'rename_column'
	| 'execute_raw';

export interface MigrationOp {
	readonly kind:      OpKind;
	readonly table?:    string;
	readonly column?:   string;
	readonly type?:     string;
	readonly nullable?: boolean;
	readonly default?:  string;
	readonly raw?:      string;
}

export interface Migration {
	readonly id:         string;
	readonly label:      string;
	readonly path:       string;
	readonly appliedAt?: string;
	readonly operations: readonly MigrationOp[];
}
