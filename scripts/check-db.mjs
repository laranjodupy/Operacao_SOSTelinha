import { loadEnvConfig } from '@next/env';
loadEnvConfig(process.cwd());
const { db, closeDatabase } = await import('../lib/server/db.ts');
const { safeDiagnostic } = await import('../lib/server/diagnostics.ts');
try {
  for (const table of ['meta','products','conversations','messages','orders','reservations','audit','sessions','rate_limits'])
    await db().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get();
  const row = await db().prepare('SELECT value FROM meta WHERE key=?').get('settings');
  if (!row) throw new Error('Missing settings');
  console.log('OK: conexão e tabelas verificadas. Nenhum segredo exibido.');
} catch (error) {
  const diagnostic = safeDiagnostic(error);
  console.error(`Falha [${diagnostic.code}]: ${diagnostic.hint}`);
  process.exitCode = 1;
} finally { await closeDatabase(); }
