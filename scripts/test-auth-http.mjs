import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout} from 'node:timers/promises';
import assert from 'node:assert/strict';
const base='http://127.0.0.1:3468',origin='https://app.example.test';
const env={...process.env,PORT:'3468',HOSTNAME:'127.0.0.1',APP_URL:origin,VERCEL:'1',AUTH_PROVIDER:'local',SUPABASE_URL:'https://auth-http-test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',ADMIN_EMAIL:'admin@example.test'};
for(const key of ['SUPABASE_SECRET_KEY','SUPABASE_SERVICE_ROLE_KEY','DATABASE_URL','ADMIN_PASSWORD','ADMIN_PASSWORD_HASH']) delete env[key];
const child=spawn(process.execPath,['--import',new URL('../tests/helpers/mock-auth.mjs',import.meta.url).href,'.next/standalone/server.js'],{env,stdio:['ignore','pipe','pipe']});
let diagnostics='';child.stderr.on('data',chunk=>diagnostics+=chunk.toString());
try {
  let ready=false;
  for(let i=0;i<100;i++) {
    try {if((await fetch(base+'/api/health')).ok) {ready=true;break;}} catch {}
    await setTimeout(100);
  }
  assert.ok(ready,'Auth test server failed: '+diagnostics);
  const post=(path,body,cookie='',requestOrigin=origin)=>fetch(base+path,{method:'POST',headers:{origin:requestOrigin,'content-type':'application/json',cookie},body:JSON.stringify(body)});
  assert.equal((await post('/api/login',{email:env.ADMIN_EMAIL,password:'wrong'})).status,401);
  assert.equal((await post('/api/login',{email:env.ADMIN_EMAIL,password:'synthetic-password'},'','https://other.example.test')).status,403);
  const login=await post('/api/login',{email:env.ADMIN_EMAIL,password:'synthetic-password'});
  assert.equal(login.status,200);assert.deepEqual(await login.json(),{ok:true});
  const cookies=login.headers.getSetCookie();assert.equal(cookies.length,2);
  for(const cookie of cookies) {assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=strict/i);}
  const cookie=cookies.map(c=>c.split(';')[0]).join('; ');
  const session=await fetch(base+'/api/session',{headers:{cookie}});
  assert.match(session.headers.get('cache-control'),/no-store/);assert.deepEqual(await session.json(),{authenticated:true});
  const refreshed=await fetch(base+'/api/session',{headers:{cookie:'tray_refresh=synthetic-refresh-token'}});
  assert.deepEqual(await refreshed.json(),{authenticated:true});assert.equal(refreshed.headers.getSetCookie().length,2);
  assert.equal((await fetch(base+'/api/products')).status,401);
  const logout=await post('/api/logout',{},cookie);assert.equal(logout.status,200);
  assert.equal(logout.headers.getSetCookie().length,2);
  for(const c of logout.headers.getSetCookie()) assert.match(c,/Max-Age=0/);
  console.log('OK: Supabase Auth HTTP login, CSRF, HttpOnly/Secure cookies, refresh, protected routes and logout; no data credentials or database.');
} finally {
  if(child.exitCode===null && child.signalCode===null) {const ended=once(child,'exit');child.kill();await ended;}
}
