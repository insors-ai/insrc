/**
 * Shared types for the `code_orm_scan` tool's per-dialect parsers
 * (code-analyzer-skills.md Phase 0.4).
 *
 * Each per-ORM parser exports a `scanX(repoPath): Promise<OrmModel[]>`
 * shape and a `detectX(repoPath, files): Promise<boolean>` shape so
 * the tool's `auto` mode can fan out cheaply.
 */

export type OrmDialect =
	| 'prisma'
	| 'typeorm'
	| 'sequelize'
	| 'sqlalchemy'
	| 'django'
	| 'hibernate'
	| 'activerecord';

export interface OrmColumn {
	readonly name:      string;
	readonly type?:     string;
	readonly nullable?: boolean;
	readonly default?:  string;
	readonly isPrimary?: boolean;
	readonly isUnique?:  boolean;
}

export interface OrmRelation {
	readonly kind:    'belongs_to' | 'has_many' | 'has_one' | 'many_to_many';
	readonly target:  string;
	readonly through?: string;
	readonly fieldName?: string;
}

export interface OrmModel {
	readonly name:       string;
	readonly table?:     string;
	readonly columns:    readonly OrmColumn[];
	readonly relations:  readonly OrmRelation[];
	readonly path:       string;
	readonly line:       number;
	readonly dialect:    OrmDialect;
}
