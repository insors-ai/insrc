/** Owned live services only. Credentials/seed rows travel through SDK calls, never argv. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import pg from 'pg';
import { Redis } from 'ioredis';
import { databaseFixture } from './docker-database.js';

export async function sessionServices(directory: string) {
	const pgBin = process.env['INSRC_TEST_PG_BIN'] ?? '/opt/homebrew/opt/postgresql@17/bin';
	const data = join(directory, 'pg'), socket = join(directory, 'socket'); await mkdir(socket);
	execFileSync(join(pgBin, 'initdb'), ['-D', data, '-U', 'fixture_admin', '--auth-local=trust', '--auth-host=scram-sha-256', '--no-locale', '--encoding=UTF8'], { stdio: 'ignore', timeout: 30000 });
	const portServer = createServer(); await new Promise<void>(resolve => portServer.listen(0, '127.0.0.1', resolve)); const address = portServer.address(); assert.ok(address && typeof address === 'object'); const port = address.port; await new Promise<void>(resolve => portServer.close(() => resolve()));
	const child = spawn(join(pgBin, 'postgres'), ['-D', data, '-k', socket, '-p', String(port), '-h', '127.0.0.1', '-c', 'log_statement=none', '-c', 'log_min_error_statement=panic', '-c', 'log_connections=off', '-c', 'log_disconnections=off', '-c', 'fsync=off'], { stdio: ['ignore', 'pipe', 'pipe'] });
	let diagnostics = ''; child.stdout.on('data', b => { diagnostics += b; }); child.stderr.on('data', b => { diagnostics += b; });
	const redis: ReturnType<typeof databaseFixture>[] = [];
	const endpoints: { sql: string; kv: string; username: string; password: string; kvPassword: string; marker: string }[] = [];
	async function close() {
		for (const value of redis) value.close();
		if (child.exitCode === null && child.signalCode === null) { const ended = once(child, 'exit'); child.kill('SIGINT'); await ended; }
	}
	try {
		let ready = false;
		for (let n = 0;n < 200;n++) {
			const client = new pg.Client({ host: socket, port, user: 'fixture_admin', database: 'postgres', connectionTimeoutMillis: 500 });
			try { await client.connect(); ready = true; break; } catch { if (child.exitCode !== null) break; await delay(25); } finally { await client.end(); }
		}
		assert.ok(ready, 'private PostgreSQL did not start');
		for (let owner = 0;owner < 2;owner++) {
			const service = databaseFixture('redis:7.4-alpine', 6379, ['redis-server', '--save', '', '--appendonly', 'no', '--loglevel', 'warning', '--logfile', '/dev/null'], {}, '128m'); redis.push(service);
			const kvPassword = 'CM_ROUTE_PRIVATE_KV_PASSWORD_' + owner;
   let seed: Redis | undefined;
   for(let attempt=0;attempt<100;attempt++){
    const candidate=new Redis({host:'127.0.0.1',port:service.port,lazyConnect:true,retryStrategy:()=>null});candidate.on('error',()=>{});
    try{await candidate.connect();seed=candidate;break;}catch{candidate.disconnect();await delay(25);}
   }
   assert.ok(seed,'private Redis did not become ready');
			try {
				await seed.config('SET', 'requirepass', kvPassword); await seed.auth(kvPassword);
				const badRedis = new Redis({ host: '127.0.0.1', port: service.port, password: 'wrong', lazyConnect: true, retryStrategy: () => null }); badRedis.on('error', () => { });
				try { await assert.rejects(badRedis.connect()); } finally { badRedis.disconnect(); }
				for (let root = 0;root < 2;root++) {
					const username = 'cm_user_' + owner + '_' + root, password = 'CM_ROUTE_PRIVATE_SQL_PASSWORD_' + owner + '_' + root, database = 'cm_db_' + owner + '_' + root, marker = 'CM_ROUTE_PRIVATE_ROW_' + owner + '_' + root;
					const admin = new pg.Client({ host: socket, port, user: 'fixture_admin', database: 'postgres' }); await admin.connect();
					try { await admin.query(`CREATE ROLE ${username} LOGIN PASSWORD '${password}'`); await admin.query(`CREATE DATABASE ${database} OWNER ${username}`); } finally { await admin.end(); }
					const sql = `postgres://127.0.0.1:${port}/${database}`, client = new pg.Client({ host: '127.0.0.1', port, database, user: username, password }); await client.connect();
					try { await client.query('CREATE TABLE data(marker TEXT)'); await client.query('INSERT INTO data VALUES ($1)', [marker]); } finally { await client.end(); }
					const bad = new pg.Client({ host: '127.0.0.1', port, database, user: username, password: 'wrong' });
					try { await assert.rejects(bad.connect()); } finally { await bad.end(); }
					await seed.select(root); await seed.set('data:marker', marker);
					endpoints.push({ sql, kv: `redis://127.0.0.1:${service.port}/${root}`, username, password, kvPassword, marker });
				}
			} finally { seed.disconnect(); }
		}
		async function assertDrained() {
			const admin = new pg.Client({ host: socket, port, user: 'fixture_admin', database: 'postgres' }); await admin.connect();
			try { assert.equal(Number((await admin.query("SELECT count(*) AS n FROM pg_stat_activity WHERE usename LIKE 'cm_user_%'")).rows[0].n), 0, 'Session PostgreSQL connections must really close'); } finally { await admin.end(); }
			for (let owner = 0;owner < redis.length;owner++) {
				const observer = new Redis({ host: '127.0.0.1', port: redis[owner]!.port, password: endpoints[owner * 2]!.kvPassword, lazyConnect: true, retryStrategy: () => null }); observer.on('error', () => { });
				try { await observer.connect(); assert.equal(String(await observer.client('LIST')).trim().split('\n').length, 1, 'only the observer may remain connected to the Redis service'); } finally { observer.disconnect(); }
			}
		}
  async function assertPreserved() {
   for(const endpoint of endpoints){
    const url=new URL(endpoint.sql);url.username=endpoint.username;url.password=endpoint.password;
    const sql=new pg.Client({connectionString:url.href});await sql.connect();
    try{assert.deepEqual((await sql.query('SELECT marker FROM data')).rows,[{marker:endpoint.marker}]);}finally{await sql.end();}
    const kvUrl=new URL(endpoint.kv);kvUrl.password=endpoint.kvPassword;
    const kv=new Redis(kvUrl.href,{lazyConnect:true,retryStrategy:()=>null});kv.on('error',()=>{});await kv.connect();
    try{assert.equal(await kv.get('data:marker'),endpoint.marker);}finally{await kv.quit();}
   }
  }
  return { endpoints, close, assertDrained, assertPreserved, diagnostics: () => diagnostics };
	} catch (error) { await close(); throw error; }
}
