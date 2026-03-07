import { RecordId } from 'surrealdb';
import type { DbClient } from './client.js';
import type { RegisteredRepo } from '../shared/types.js';
import { basename } from 'node:path';

// SurrealDB record ID for a repo row: registered_repo:<encoded-path>
function repoRecordId(path: string): RecordId {
  // Use base64url of the path as the record ID to avoid special-char issues
  const encoded = Buffer.from(path).toString('base64url');
  return new RecordId('registered_repo', encoded);
}

export async function addRepo(db: DbClient, repo: RegisteredRepo): Promise<void> {
  await db.upsert(repoRecordId(repo.path)).content({
    path:        repo.path,
    name:        repo.name || basename(repo.path),
    addedAt:     repo.addedAt,
    lastIndexed: repo.lastIndexed ?? null,
    status:      repo.status,
    errorMsg:    repo.errorMsg ?? null,
  });
}

export async function removeRepo(db: DbClient, path: string): Promise<void> {
  await db.delete(repoRecordId(path));
}

export async function listRepos(db: DbClient): Promise<RegisteredRepo[]> {
  const [rows] = await db.query<[RegisteredRepo[]]>(
    'SELECT path, name, addedAt, lastIndexed, status, errorMsg FROM registered_repo',
  );
  return rows ?? [];
}

export async function updateRepoStatus(
  db: DbClient,
  path: string,
  status: RegisteredRepo['status'],
  lastIndexed?: string,
  errorMsg?: string,
): Promise<void> {
  await db.query(
    `UPDATE $id SET status = $status, lastIndexed = $lastIndexed, errorMsg = $errorMsg`,
    {
      id:          repoRecordId(path),
      status,
      lastIndexed: lastIndexed ?? null,
      errorMsg:    errorMsg ?? null,
    },
  );
}
