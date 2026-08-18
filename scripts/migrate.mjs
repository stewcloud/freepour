import fs from 'node:fs/promises'; import pg from 'pg';
const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
await pool.query('create table if not exists schema_migrations(name text primary key, applied_at timestamptz not null default now())');
for(const name of (await fs.readdir('migrations')).filter(n=>n.endsWith('.sql')).sort()){const seen=await pool.query('select 1 from schema_migrations where name=$1',[name]);if(!seen.rowCount){await pool.query('begin');try{await pool.query(await fs.readFile(`migrations/${name}`,'utf8'));await pool.query('insert into schema_migrations(name) values($1)',[name]);await pool.query('commit')}catch(e){await pool.query('rollback');throw e}}}await pool.end();

