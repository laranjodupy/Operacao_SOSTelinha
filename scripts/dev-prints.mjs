import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
  console.error('O modo de capturas é exclusivo do desenvolvimento local.');
  process.exit(1);
}
// Override provider selection so screenshots need no remote secrets or services.
Object.assign(process.env, {
  NODE_ENV:'development',AUTH_PROVIDER:'local',
  LOCAL_SCREENSHOT_MODE:'true',
  DATABASE_PROVIDER:'sqlite',
  DATABASE_PATH:resolve('data/capturas.sqlite'),
  DEMO_MODE:'true', AI_PROVIDER:'local', WHATSAPP_PROVIDER:'demo',
  APP_URL:'http://localhost:3000',
});
// Prevent .env files from overriding this isolated profile in the Next child.
const { seedDemo } = await import('../lib/server/store.ts');
await seedDemo();
const { db } = await import('../lib/server/db-sqlite.ts');
db().close();
console.log('Modo de capturas: abra http://localhost:3000. Painel sem login e dados fictícios.');
const child=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','127.0.0.1','--port','3000'],{stdio:'inherit',env:{...process.env}});
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>child.kill(signal));
child.on('error',()=>{console.error('Não foi possível iniciar o servidor local.');process.exitCode=1;});
child.on('exit',code=>process.exit(code??0));
