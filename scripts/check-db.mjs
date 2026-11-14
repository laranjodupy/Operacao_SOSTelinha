import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
const { db, closeDatabase } = await import('../lib/server/db.ts');
try {
  const row = await db().prepare('SELECT value FROM meta WHERE key=?').get('settings');
  if (!row) throw new Error('Missing settings');
  console.log('OK: conexão e migração do banco verificadas. Nenhum segredo exibido.');
} catch { console.error('Falha ao verificar banco. Confira DATABASE_URL, TLS e a migração SQL.'); process.exitCode = 1; }
finally { await closeDatabase(); }
