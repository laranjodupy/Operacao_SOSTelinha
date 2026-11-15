import { test } from 'node:test';
import assert from 'node:assert/strict';
import { login,requestAuth,logout } from '../lib/server/auth.ts';
import { supabaseAuthEnabled } from '../lib/server/supabase-auth.ts';
import { writeAuthCookies } from '../lib/server/auth-cookies.ts';
import { safeDiagnostic } from '../lib/server/diagnostics.ts';

test('Supabase Auth validates identities, renews tokens and revokes sessions without a database connection',async()=>{
  const saved={...process.env}, originalFetch=globalThis.fetch;
  Object.assign(process.env,{VERCEL:'1',AUTH_PROVIDER:'local',SUPABASE_URL:'https://auth-test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_synthetic',ADMIN_EMAIL:'admin@example.test',ADMIN_PASSWORD:'old-password-must-not-work',DATABASE_PROVIDER:'supabase'});
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const user={id:'11111111-2222-4333-8444-555555555555',email:'admin@example.test',aud:'authenticated',role:'authenticated',created_at:new Date().toISOString()};
  const jwt=(tag:string)=>Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600,tag})).toString('base64url')+'.synthetic';
  const access=jwt('initial'), rotated=jwt('rotated');
  let mode='ok',signouts=0,refreshes=0,passwordCalls=0;
  const session=(token:string)=>({access_token:token,refresh_token:'refresh-'+token.slice(-20),expires_in:3600,token_type:'bearer',user:{...user,email:mode==='other'?'other@example.test':user.email}});
  const denied=(code='bad_jwt',status=401)=>Response.json({code,msg:'Synthetic auth error'},{status,headers:{'x-supabase-api-version':'2024-01-01'}});
  globalThis.fetch=(async(input,init)=>{
    const url=new URL(String(input));
    assert.equal(url.origin,'https://auth-test.supabase.co');
    assert.ok(url.pathname.startsWith('/auth/v1/'),'Auth must never query /rest/v1 or the database');
    assert.equal(new Headers(init?.headers).get('apikey'),'sb_publishable_synthetic');
    assert.equal(init?.redirect,'error');assert.equal(init?.cache,'no-store');
    if(mode==='outage') return denied('unexpected_failure',503);
    if(url.pathname.endsWith('/token') && url.searchParams.get('grant_type')==='password') {
      passwordCalls++;
      if(mode==='wrong') return denied('invalid_credentials',400);
      if(mode==='unconfirmed') return denied('email_not_confirmed',400);
      if(mode==='limited') return denied('over_request_rate_limit',429);
      const body=JSON.parse(init?.body as string);assert.equal(body.email,user.email);assert.equal(body.password,'supabase-password');
      return Response.json(session(access));
    }
    if(url.pathname.endsWith('/user')) {
      const token=new Headers(init?.headers).get('authorization');
      if(token==='Bearer tampered' || (mode==='expired' && token==='Bearer '+access)) return denied();
      assert.ok(token==='Bearer '+access || token==='Bearer '+rotated);
      return Response.json({...user,email:mode==='other'?'other@example.test':user.email});
    }
    if(url.pathname.endsWith('/token') && url.searchParams.get('grant_type')==='refresh_token') {
      refreshes++;
      if(mode==='revoked') return denied('refresh_token_not_found',400);
      return Response.json(session(rotated));
    }
    if(url.pathname.endsWith('/logout')) {
      signouts++;assert.equal(url.searchParams.get('scope'),'local');
      if(mode==='expired' && new Headers(init?.headers).get('authorization')==='Bearer '+access) return denied();
      return new Response(null,{status:204});
    }
    throw new Error('Unexpected synthetic endpoint');
  }) as typeof fetch;
  const request=(token?:string,refresh?:string)=>({cookies:{get:(name:string)=>{const value=name==='tray_session'?token:name==='tray_refresh'?refresh:undefined;return value?{value}:undefined;}},url:'https://app.example.test/api/session',headers:new Headers({host:'app.example.test'})}) as any;
  try {
    assert.equal(supabaseAuthEnabled(),true,'Vercel cannot fall back to local credentials');
    const result=await login('admin@example.test','supabase-password');
    assert.equal(result.token,access);assert.ok(result.refreshToken);assert.equal(passwordCalls,1);
    assert.equal((await requestAuth(request(access))).authenticated,true);
    assert.equal((await requestAuth(request('tampered'))).authenticated,false);
    mode='expired';
    const renewed=await requestAuth(request(access,'refresh-valid'));
    assert.equal(renewed.authenticated,true);assert.equal(renewed.tokens?.token,rotated);assert.equal(refreshes,1);
    const writes:any[]=[];const response={cookies:{set:(...args:any[])=>writes.push(args)}} as any;
    writeAuthCookies(response,renewed,true);
    assert.equal(writes.length,2);
    for(const [, ,options] of writes) {assert.equal(options.httpOnly,true);assert.equal(options.secure,true);assert.equal(options.sameSite,'strict');}
    assert.equal(writes[1][2].path,'/api');
    await logout(request(access,'refresh-valid'));assert.equal(refreshes,2);assert.equal(signouts,2,'expired access must still revoke the refreshed session');
    writes.length=0;writeAuthCookies(response,{authenticated:false,clear:true},true);assert.equal(writes.length,2);assert.equal(writes[1][2].maxAge,0);
    mode='revoked';assert.equal((await requestAuth(request(undefined,'revoked'))).authenticated,false);
    mode='other';assert.equal((await requestAuth(request(access))).authenticated,false);
    await assert.rejects(login('admin@example.test','supabase-password'),(e:any)=>e.status===403);
    for(const [scenario,status] of [['wrong',401],['unconfirmed',403],['limited',429]] as const) {
      mode=scenario;await assert.rejects(login('admin@example.test','supabase-password'),(e:any)=>e.status===status);
    }
    mode='outage';await assert.rejects(login('admin@example.test','supabase-password'),(e:any)=>safeDiagnostic(e).code==='SUPABASE_AUTH_SERVICE');
  } finally {
    globalThis.fetch=originalFetch;
    for(const key of Object.keys(process.env)) if(!(key in saved)) delete process.env[key];
    Object.assign(process.env,saved);
  }
});
