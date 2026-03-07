import type { DbClient } from './client.js';
import type { RegisteredRepo } from '../shared/types.js';
import { basename } from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function kuzuExec(db: DbClient, stmt: string, params: any): Promise<Record<string, unknown>[]> {
  const prepared = await db.graph.prepare(stmt);
  const result   = await db.graph.execute(prepared, params);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const qr = Array.isArray(result) ? result[0]! : result;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (qr as any).getAll() as Record<string, unknown>[];
}

async function kuzuQuery(db: DbClient, stmt: string): Promise<Record<string, unknown>[]> {
  const result = await db.graph.query(stmt);
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const qr = Array.isArray(result) ? result[0]! : result;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (qr as any).getAll() as Record<string, unknown>[];
}

export async function addRepo(db: DbClient, repo: RegisteredRepo): Promise<void> {
  const name = repo.name || basename(repo.path);
  await kuzuExec(
    db,
    `MERGE (r:Repo {id: $path})
     SET r.path = $path, r.name = $name, r.addedAt = $addedAt,
         r.lastIndexed = $lastIndexed, r.status = $status, r.errorMsg = $errorMsg`,
    {
      path:        repo.path,
      name,
      addedAt:     repo.addedAt,
      lastIndexed: repo.lastIndexed ?? '',
      status:      repo.status,
      errorMsg:    repo.errorMsg ?? '',
    },
  );
}

export async function removeRepo(db: DbClient, path: string): Promise<void> {
  await kuzuExec(db, 'MATCH (r:Repo {id: $path}) DETACH DELETE r', { path });
}

export async function listRepos(db: DbClient): Promise<RegisteredRepo[]> {
  const rows = await kuzuQuery(
    db,
    `MATCH (r:Repo)
     RETURN r.path AS path, r.name AS name, r.addedAt AS addedAt,
            r.lastIndexed AS lastIndexed, r.status AS status, r.errorMsg AS errorMsg`,
  );
  return rows.map(r => {
    const repo: RegisteredRepo = {
      path:    r['path']   as string,
      name:    r['name']   as string,
      addedAt: r['addedAt'] as string,
      status:  r['status'] as RegisteredRepo['status'],
    };
    const li = r['lastIndexed']; if (li) repo.lastIndexed = li as string;
    const em = r['errorMsg'];    if (em) repo.errorMsg    = em as string;
    return repo;
  });
}

export async function updateRepoStatus(
  db: DbClient,
  path: string,
  status: RegisteredRepo['status'],
  lastIndexed?: string,
  errorMsg?: string,
): Promise<void> {
  await kuzuExec(
    db,
    `MATCH (r:Repo {id: $path})
     SET r.status = $status, r.lastIndexed = $lastIndexed, r.errorMsg = $errorMsg`,
    { path, status, lastIndexed: lastIndexed ?? '', errorMsg: errorMsg ?? '' },
  );
}
