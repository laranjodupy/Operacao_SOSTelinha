import "server-only";
import { usesSupabase, supabaseRpc } from "./supabase.ts";

import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { db as sqliteDb } from "./db-sqlite.ts";

type Client = pg.PoolClient;
const scope = new AsyncLocalStorage<{ client?: Client }>();
let pool: pg.Pool | undefined;
let tail = Promise.resolve();
export const now = () => new Date().toISOString();
export const uid = () => randomUUID();
const tables = /\b(meta|products|conversations|messages|orders|reservations|audit|sessions|rate_limits)\b/g;
export function postgresSql(sql: string) {
  let index = 0;
  return sql.replace(/INSERT OR IGNORE INTO/g, "INSERT INTO")
    .replace("SET count=count+1", "SET count=rate_limits.count+1")
    .replace(/\browid\b/g, "id")
    .replace(/\b[a-z]+[A-Z][A-Za-z]*\b/g, word => `"${word}"`)
    .replace(tables, name => `tray_balcao.${name}`)
    .replace(/\?/g, () => `$${++index}`)
    + (/INSERT OR IGNORE/.test(sql) ? " ON CONFLICT DO NOTHING" : "");
}
function usePostgres() {
  if (process.env.VERCEL && !process.env.DATABASE_URL)
    throw new Error("Configure DATABASE_URL do Supabase antes de publicar.");
  return !!process.env.DATABASE_URL;
}
function getPool() {
  if (!pool) {
    const parsed = new URL(process.env.DATABASE_URL!);
    // pg connection-string SSL parameters must not override certificate validation.
    for (const key of ["sslmode", "sslcert", "sslkey", "sslrootcert"]) parsed.searchParams.delete(key);
    pool = new pg.Pool({ connectionString: parsed.toString(), max: 1,
      connectionTimeoutMillis: 10_000, idleTimeoutMillis: 10_000,
      allowExitOnIdle: true,
      ssl: process.env.DATABASE_SSL === "false" && !process.env.VERCEL ? false : {
        rejectUnauthorized: true,
        ...(process.env.DATABASE_SSL_CA ? { ca: process.env.DATABASE_SSL_CA.replace(/\\n/g, "\n") } : {}),
      },
    });
    pool.on("error", () => { /* Never log connection strings or provider errors. */ });
  }
  return pool;
}
async function serial<T>(fn: () => Promise<T>): Promise<T> {
  const previous = tail; let release!: () => void;
  tail = new Promise<void>(resolve => { release = resolve; });
  await previous;
  try { return await fn(); } finally { release(); }
}
async function query(sql: string, args: unknown[]) {
  if (usesSupabase()) throw new Error("Esta operação precisa usar uma RPC transacional no modo Supabase.");
  if (usePostgres()) {
    const connection = scope.getStore()?.client || getPool();
    const result = await connection.query(postgresSql(sql), args);
    // COUNT/SUM are int8 in Postgres. Domain bounds keep these values within safe integers.
    const rows = result.rows.map(row => Object.fromEntries(Object.entries(row).map(([k,v]) =>
      [k, ["n", "reserved", "subtotal", "total"].includes(k) && typeof v === "string" ? Number(v) : v])));
    return { rows, changes: result.rowCount || 0 };
  }
  const execute = async () => {
    const statement = sqliteDb().prepare(sql);
    if (/^\s*(SELECT|WITH)/i.test(sql)) return { rows: statement.all(...args as any[]), changes: 0 };
    return { rows: [], changes: Number(statement.run(...args as any[]).changes) };
  };
  return scope.getStore() ? execute() : serial(execute);
}
export function db() {
  return {
    prepare(sql: string) { return {
      async all(...args: unknown[]): Promise<any[]> { return (await query(sql, args)).rows; },
      async get(...args: unknown[]): Promise<any> { return (await query(sql, args)).rows[0]; },
      async run(...args: unknown[]) { return { changes: (await query(sql, args)).changes }; },
    }; },
    async exec(sql: string) {
      if (usesSupabase()) throw new Error("Use o SQL Editor para executar migrações no modo Supabase.");
      if (usePostgres()) throw new Error("Use a migração SQL para operações administrativas.");
      const execute = async () => { sqliteDb().exec(sql); };
      return scope.getStore() ? execute() : serial(execute);
    },
  };
}
export async function transaction<T>(fn: () => T | Promise<T>): Promise<T> {
  if (usesSupabase()) throw new Error("Transações Supabase devem usar RPC.");
  if (scope.getStore()) return fn();
  if (usePostgres()) {
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL statement_timeout = '15000'");
      await client.query("SET LOCAL lock_timeout = '10000'");
      // All stock/order mutations serialize across Vercel instances, like BEGIN IMMEDIATE.
      await client.query("SELECT pg_advisory_xact_lock(748391204)");
      const result = await scope.run({ client }, fn);
      await client.query("COMMIT"); return result;
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  return serial(async () => {
    const connection = sqliteDb(); connection.exec("BEGIN IMMEDIATE");
    try { const result = await scope.run({}, fn); connection.exec("COMMIT"); return result; }
    catch (error) { connection.exec("ROLLBACK"); throw error; }
  });
}
export async function log(action: string, detail: string) {
  if (usesSupabase()) { await supabaseRpc("audit",{action,detail:detail.slice(0,1500)}); return; }
  await db().prepare("INSERT INTO audit VALUES(?,?,?,?)").run(uid(), action, detail.slice(0,1500), now());
}
export async function closeDatabase() { await pool?.end(); pool = undefined; }
