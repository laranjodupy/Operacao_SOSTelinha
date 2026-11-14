import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import { db, closeDatabase, transaction } from '../lib/server/db.ts';
import { saveProduct, createOrder, payDemo, products, snapshot, receive, createProductBatch } from '../lib/server/store.ts';
import { limit, login } from '../lib/server/auth.ts';

test('Postgres schema, SQL adapter, transactions, access isolation and business flow', async () => {
  const engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
  await engine.exec(readFileSync(new URL('../supabase/migrations/001_initial.sql', import.meta.url), 'utf8'));
  const originalConnect = pg.Pool.prototype.connect, originalQuery = pg.Pool.prototype.query;
  const query = async (sql: string, args: any[] = []) => {
    const r = await engine.query(sql, args);
    return { rows: r.rows, rowCount: r.affectedRows };
  };
  pg.Pool.prototype.query = query as any;
  pg.Pool.prototype.connect = (async () => ({ query, release() {} })) as any;
  process.env.DATABASE_URL = 'postgresql://synthetic:synthetic@localhost/postgres';
  process.env.DEMO_MODE = 'true';
  process.env.ADMIN_EMAIL = 'admin@example.test';
  process.env.ADMIN_PASSWORD = 'synthetic-only';
  try {
    const p = await saveProduct({ name:'Caderno', sku:'PG-1', price:1000, stock:3, category:'Papel', description:'' });
    const o = await createOrder({ customerName:'Teste', items:[{productId:p.id,quantity:2}] }, 'order-1');
    assert.equal((await products())[0].available, 1);
    await assert.rejects(() => createOrder({customerName:'Teste',items:[{productId:p.id,quantity:2}]},'order-2'), /Estoque/);
    await payDemo(o.token,{delivery:'pickup'});
    await payDemo(o.token,{delivery:'pickup'});
    assert.equal((await products())[0].stock, 1);
    assert.equal((await snapshot()).metrics.revenue, 2000);
    const c = {name:'Contato',phone:'5579999999999',text:'Olá',externalId:'event-1'};
    await receive(c,'webhook');
    assert.equal((await receive(c,'webhook')).duplicate,true);
    await assert.rejects(() => transaction(async () => {
      await db().prepare('UPDATE products SET stock=0 WHERE id=?').run(p.id);
      throw new Error('rollback');
    }), /rollback/);
    assert.equal((await products())[0].stock,1);
    await assert.rejects(() => createProductBatch({products:[{name:'X',sku:'NEW',price:100,stock:1,category:'X'},{name:'Y',sku:'PG-1',price:100,stock:1,category:'Y'}]},'batch-1'));
    assert.equal((await products()).length,1);
    await limit('test',1,60000);
    await assert.rejects(() => limit('test',1,60000), /Muitas/);
    assert.ok((await login('admin@example.test','synthetic-only')).token);
    await engine.exec('SET ROLE anon');
    await assert.rejects(() => engine.query('SELECT * FROM tray_balcao.sessions'), /permission denied/);
    await engine.exec('RESET ROLE');
  } finally {
    await closeDatabase();
    delete process.env.DATABASE_URL;
    pg.Pool.prototype.connect = originalConnect;
    pg.Pool.prototype.query = originalQuery;
    await engine.close();
  }
});
