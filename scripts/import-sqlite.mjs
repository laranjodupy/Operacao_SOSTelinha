import { loadEnvConfig } from '@next/env';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
loadEnvConfig(process.cwd());
const { db, transaction, closeDatabase } = await import('../lib/server/db.ts');
const {usesSupabase,supabaseRpc} = await import('../lib/server/supabase.ts');
const filename = process.argv.slice(2).find(arg => arg !== '--confirm');
if (!filename || !existsSync(filename)) throw new Error('Informe um arquivo SQLite existente.');
if (!usesSupabase() && !process.env.DATABASE_URL) throw new Error('Configure DATABASE_URL do destino.');
const source = new DatabaseSync(filename, { readOnly:true });
const tables = ['products','conversations','messages','orders','reservations','audit'];
try {
  const data = Object.fromEntries(tables.map(table => [table, source.prepare(`SELECT * FROM ${table}`).all()]));
  console.log(Object.fromEntries(tables.map(t => [t,data[t].length])));
  if (!process.argv.includes('--confirm')) console.log('Somente leitura. Use --confirm para importar no destino vazio.');
  else {
    if (usesSupabase()) {
      const payload={...data,meta:source.prepare('SELECT key,value FROM meta').all()};
      if (Buffer.byteLength(JSON.stringify(payload))>5_000_000) throw new Error('Use importação PostgreSQL direta para volumes maiores.');
      await supabaseRpc('importData',payload);
    } else await transaction(async () => {
      for (const table of tables) {
        const row = await db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
        if (Number(row.n)) throw new Error('O destino deve estar vazio.');
      }
      for (const table of tables) for (const row of data[table]) {
        const columns = Object.keys(row);
        await db().prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`).run(...Object.values(row));
      }
      const metadata = source.prepare('SELECT key,value FROM meta').all();
      for (const row of metadata) await db().prepare('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(row.key,row.value);
    });
    console.log('Importação concluída em uma transação. Sessões não foram copiadas.');
  }
} catch { console.error('Importação cancelada. Confira destino vazio, schema e conexão; nenhuma transação parcial foi mantida.'); process.exitCode=1; }
finally { source.close(); await closeDatabase(); }
