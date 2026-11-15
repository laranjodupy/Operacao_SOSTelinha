import "server-only";
import { fail } from "./validation.ts";
export function usesSupabase() {
  const selected = process.env.DATABASE_PROVIDER;
  if (selected === 'postgres' || selected === 'sqlite') return false;
  return selected === 'supabase' || !!process.env.SUPABASE_URL || !!process.env.SUPABASE_SECRET_KEY || !!process.env.SUPABASE_SERVICE_ROLE_KEY;
}
export function supabaseConfig() {
  let url: URL;
  try { url = new URL(process.env.SUPABASE_URL || ''); }
  catch { throw Object.assign(new Error('Supabase configuration'),{code:'SUPABASE_CONFIG'}); }
  // Credentials may travel only to the configured HTTPS Supabase project origin.
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname))
    throw Object.assign(new Error('Supabase configuration'),{code:'SUPABASE_CONFIG'});
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.startsWith('sb_publishable_'))
    throw Object.assign(new Error('Supabase server key required'),{code:'SUPABASE_CONFIG'});
  return { origin:url.origin, key };
}
export async function supabaseRpc<T = any>(action: string, payload: Record<string,unknown> = {}): Promise<T> {
  const {origin,key} = supabaseConfig();
  const headers: Record<string,string> = {'content-type':'application/json',apikey:key};
  // Legacy service_role is a JWT. Modern sb_secret keys use apikey only.
  if (!key.startsWith('sb_secret_')) headers.Authorization = `Bearer ${key}`;
  let response: Response;
  try {
    response = await fetch(`${origin}/rest/v1/rpc/tray_balcao_api`,{
      method:'POST', headers, body:JSON.stringify({p_action:action,p_payload:payload}),
      redirect:'error', cache:'no-store', signal:AbortSignal.timeout(25000),
    });
  } catch (cause) { throw Object.assign(new Error('Supabase unavailable',{cause}),{code:'SUPABASE_NETWORK'}); }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    // Business failures have explicit SQLSTATEs and controlled messages in our migration.
    const business: Record<string,string> = {
      PT400:'Dados inválidos para esta operação.', PT403:'Operação indisponível.',
      PT404:'Registro não encontrado.', PT409:'Conflito na operação. Confira estoque, SKU, status e chave de repetição.',
    };
    if (data?.code && Object.hasOwn(business,data.code)) fail(Number(data.code.slice(2)),business[data.code]);
    if (data?.code === '23505') fail(409,'Esse código ou identificador já está em uso.');
    const code = response.status === 401 || response.status === 403 ? 'SUPABASE_AUTH'
      : data?.code === 'PGRST202' ? 'SUPABASE_MIGRATION'
      : ['42P01','3F000','42501','22003','42702'].includes(data?.code) ? data.code : 'SUPABASE_API';
    throw Object.assign(new Error('Supabase operation failed'),{code});
  }
  return data as T;
}
