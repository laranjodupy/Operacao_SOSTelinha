// Imported explicitly only by test-auth-http.mjs; never loaded by the application.
const original=globalThis.fetch;
const user={id:'11111111-2222-4333-8444-555555555555',email:'admin@example.test',aud:'authenticated',created_at:new Date().toISOString()};
const token='synthetic-access-token';
const denied=()=>Response.json({code:'invalid_credentials',msg:'Synthetic invalid credentials'},{status:400,headers:{'x-supabase-api-version':'2024-01-01'}});
globalThis.fetch=async(input,init)=>{
  const url=new URL(String(input));
  if(url.hostname!=='auth-http-test.supabase.co') return original(input,init);
  if(!url.pathname.startsWith('/auth/v1/')) throw new Error('Auth unexpectedly queried the database');
  if(url.pathname.endsWith('/token')) {
    const b=JSON.parse(init.body);
    if(url.searchParams.get('grant_type')==='password' && (b.email!==user.email || b.password!=='synthetic-password')) return denied();
    if(url.searchParams.get('grant_type')==='refresh_token' && b.refresh_token!=='synthetic-refresh-token') return denied();
    return Response.json({access_token:token,refresh_token:'synthetic-refresh-token',expires_in:3600,token_type:'bearer',user});
  }
  if(url.pathname.endsWith('/user')) return new Headers(init.headers).get('authorization')==='Bearer '+token?Response.json(user):denied();
  if(url.pathname.endsWith('/logout')) return new Response(null,{status:204});
  throw new Error('Unexpected synthetic Auth URL');
};
