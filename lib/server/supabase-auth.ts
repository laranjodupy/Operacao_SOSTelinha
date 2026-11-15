import "server-only";
import { createClient, type User } from '@supabase/supabase-js';
import { fail } from './validation.ts';

export const refreshCookieName='tray_refresh';
export type AuthState={authenticated:boolean;tokens?:{token:string;refreshToken:string;expiresAt:string};clear?:boolean};
export function supabaseAuthEnabled() {
  if(process.env.VERCEL || process.env.AUTH_PROVIDER==='supabase') return true;
  if(process.env.AUTH_PROVIDER==='local') return false;
  return !!process.env.SUPABASE_URL;
}
function client() {
  let url: URL;
  try {url=new URL(process.env.SUPABASE_URL||'');} catch {return fail(503,'Configure SUPABASE_URL para acessar o Supabase Auth.');}
  const key=process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
  if(url.protocol!=='https:' || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname)
     || !key || key.startsWith('sb_secret_'))
    return fail(503,'Configure SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY do mesmo projeto.');
  return createClient(url.origin,key,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    global:{fetch:(input,init)=>fetch(input,{...init,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)})},
  });
}
function authorized(user: User | null) {
  const admin=process.env.ADMIN_EMAIL?.trim().toLowerCase();
  if(!admin) fail(503,'Configure ADMIN_EMAIL com o e-mail do administrador cadastrado no Supabase Auth.');
  return !!user?.id && !!user.email && user.email.toLowerCase()===admin;
}
function unavailable(): never {throw Object.assign(new Error('Supabase Auth unavailable'),{code:'SUPABASE_AUTH_SERVICE'});}
function expiry(session:{expires_at?:number;expires_in?:number}) {
  return new Date((session.expires_at || Math.floor(Date.now()/1000)+(session.expires_in||3600))*1000).toISOString();
}
export async function signInSupabase(email:unknown,password:unknown) {
  if(typeof email!=='string'||typeof password!=='string'||!email.trim()||email.length>320||!password||password.length>1024)
    return fail(401,'E-mail ou senha incorretos.');
  authorized(null); // Fail before creating a remote session if the allowlist is missing.
  const auth=client();
  const {data,error}=await auth.auth.signInWithPassword({email:email.trim(),password});
  if(error) {
    if(error.code==='email_not_confirmed') fail(403,'Confirme o e-mail no Supabase Auth ou crie o usuário com Auto Confirm.');
    if(error.status===429) fail(429,'Muitas tentativas. Aguarde alguns minutos.');
    if(['invalid_credentials','user_not_found','invalid_grant'].includes(error.code||'')) fail(401,'E-mail ou senha incorretos.');
    return unavailable();
  }
  if(!data.session||!data.user) return unavailable();
  if(!authorized(data.user)) {
    await auth.auth.admin.signOut(data.session.access_token,'local');
    fail(403,'Este usuário não está autorizado a administrar esta loja. Confira ADMIN_EMAIL.');
  }
  return {token:data.session.access_token,refreshToken:data.session.refresh_token,expiresAt:expiry(data.session)};
}
export async function resolveSupabaseAuth(accessToken?:string,refreshToken?:string):Promise<AuthState> {
  if(!accessToken && !refreshToken) return {authenticated:false};
  const auth=client();
  if(accessToken) {
    const {data,error}=await auth.auth.getUser(accessToken);
    if(!error && data.user) {
      const allowed=authorized(data.user);
      return {authenticated:allowed,clear:!allowed};
    }
    if(error && (!error.status || error.status>=500)) return unavailable();
  }
  if(refreshToken) {
    const {data,error}=await auth.auth.refreshSession({refresh_token:refreshToken});
    if(error && (!error.status || error.status>=500)) return unavailable();
    if(!error && data.session) {
      // Check current identity against Auth, rather than trusting an unverified cookie/JWT decode.
      const verified=await auth.auth.getUser(data.session.access_token);
      if(verified.error && (!verified.error.status || verified.error.status>=500)) return unavailable();
      if(!verified.error && authorized(verified.data.user))
        return {authenticated:true,tokens:{token:data.session.access_token,refreshToken:data.session.refresh_token,expiresAt:expiry(data.session)}};
      await auth.auth.admin.signOut(data.session.access_token,'local');
    }
  }
  return {authenticated:false,clear:true};
}
export async function signOutSupabase(accessToken?:string,refreshToken?:string) {
  const auth=client();
  let token=accessToken;
  if(token) {
    const {error}=await auth.auth.admin.signOut(token,'local');
    if(!error) return;
    if(![401,403,404].includes(error.status||0)) return unavailable();
    token=undefined;
  }
  if(!token && refreshToken) {
    const {data,error}=await auth.auth.refreshSession({refresh_token:refreshToken});
    if(error && (!error.status || error.status>=500)) return unavailable();
    token=data.session?.access_token;
  }
  if(token) {
    const {error}=await auth.auth.admin.signOut(token,'local');
    if(error && error.status!==401 && error.status!==403 && error.status!==404) return unavailable();
  }
}
