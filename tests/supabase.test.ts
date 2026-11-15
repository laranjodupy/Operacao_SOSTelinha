import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { supabaseRpc } from '../lib/server/supabase.ts';
import { safeDiagnostic } from '../lib/server/diagnostics.ts';
import { saveProduct,products,createOrder,payDemo,transitionOrder,snapshot,receive,createProductBatch,saveSettings,settings,seedDemo,updateConversation } from '../lib/server/store.ts';
import { login,authenticated,logout,limit } from '../lib/server/auth.ts';
import { sendMessage } from '../lib/server/integrations.ts';

test('Supabase HTTPS transport and real RPC SQL preserve atomic business operations and private access', async () => {
  const engine = new PGlite();
  await engine.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;');
  for (const filename of ['001_initial.sql','002_data_api.sql']) await engine.exec(readFileSync(new URL('../supabase/migrations/'+filename,import.meta.url),'utf8'));
  const originalFetch=globalThis.fetch;
  const saved={...process.env};
  Object.assign(process.env,{DATABASE_PROVIDER:'supabase',SUPABASE_URL:'https://synthetic.supabase.co',SUPABASE_SECRET_KEY:'sb_secret_SYNTHETIC_DO_NOT_LOG',ADMIN_EMAIL:'admin@example.test',ADMIN_PASSWORD:'synthetic-test',DEMO_MODE:'true',AI_PROVIDER:'local',WHATSAPP_PROVIDER:'demo'});
  const rpc = async(action:string,payload:any={}) => (await engine.query<{result:any}>('SELECT public.tray_balcao_api($1,$2::jsonb) AS result',[action,JSON.stringify(payload)])).rows[0].result;
  let providerCalls=0;
  globalThis.fetch=(async (url,init) => {
    if(String(url).includes('evolution.example.test')) {providerCalls++;return Response.json({ok:true});}
    assert.equal(String(url),'https://synthetic.supabase.co/rest/v1/rpc/tray_balcao_api');
    assert.equal((init?.headers as any).apikey,process.env.SUPABASE_SECRET_KEY);
    assert.equal((init?.headers as any).Authorization,undefined);
    assert.equal(init?.redirect,'error');
    assert.equal(init?.cache,'no-store');
    const body=JSON.parse(init?.body as string);
    try {return Response.json(await rpc(body.p_action,body.p_payload));}
    catch(error:any) {return Response.json({code:error.code,message:'SQL detail must never leak'}, {status:error.code?.startsWith('PT')?Number(error.code.slice(2)):400});}
  }) as typeof fetch;
  try {
    assert.equal((await supabaseRpc('check')).ok,true);
    const s=await settings(); await saveSettings({...s,name:'Loja de teste',address:'Rua de teste, 1'});
    assert.equal((await settings()).name,'Loja de teste');
    const p=await saveProduct({name:'Caderno',sku:'S1',price:1200,stock:4,category:'Papel',description:''});
    assert.equal(p.available,4);assert.equal(p.active,true);
    const o=await createOrder({customerName:'Cliente',items:[{productId:p.id,quantity:3}]},'o1');
    assert.equal(o.total,3600);assert.equal((await products())[0].available,1);
    await assert.rejects(()=>createOrder({customerName:'Outro',items:[{productId:p.id,quantity:2}]},'o2'),(e:any)=>e.status===409);
    await assert.rejects(()=>saveProduct({...p,stock:2},p.id),(e:any)=>e.status===409);
    assert.equal((await createOrder({customerName:'Cliente',items:[{productId:p.id,quantity:3}]},'o1')).id,o.id);
    await payDemo(o.token,{delivery:'pickup'});await payDemo(o.token,{delivery:'pickup'});
    assert.equal((await products())[0].stock,1);
    await transitionOrder(o.id,{status:'preparing'});await transitionOrder(o.id,{status:'ready'});await transitionOrder(o.id,{status:'delivered'});
    await assert.rejects(()=>transitionOrder(o.id,{status:'paid'}));
    const c={name:'Contato',phone:'5579999999999',text:'Olá',externalId:'event1'};
    const conv=await receive(c,'webhook');assert.equal((await receive(c,'webhook')).duplicate,true);
    await updateConversation(conv.conversationId,{status:'closed'});
    const msg=await sendMessage(conv.conversationId,{text:'Resposta'},'m1');assert.equal(msg.status,'simulated');
    assert.equal((await sendMessage(conv.conversationId,{text:'Resposta'},'m1')).duplicate,true);
    process.env.WHATSAPP_PROVIDER='evolution';process.env.WHATSAPP_BASE_URL='https://evolution.example.test';process.env.WHATSAPP_INSTANCE='shop';process.env.WHATSAPP_API_KEY='synthetic';
    await sendMessage(conv.conversationId,{text:'Real'},'m2');await sendMessage(conv.conversationId,{text:'Real'},'m2');assert.equal(providerCalls,1);
    const bad={products:[{name:'Novo',sku:'NEW',price:100,stock:2,category:'X'},{name:'Duplicado',sku:'S1',price:100,stock:2,category:'X'}]};
    await assert.rejects(()=>createProductBatch(bad,'badbatch'));
    assert.equal((await products()).length,1);
    const batch=await createProductBatch({products:[{name:'Novo',sku:'NEW',price:100,stock:2,category:'X'}]},'goodbatch');
    assert.equal(batch.count,1);assert.equal((await createProductBatch({products:[{name:'Novo',sku:'NEW',price:100,stock:2,category:'X'}]},'goodbatch')).duplicate,true);
    const snap=await snapshot();assert.equal(snap.metrics.revenue,3600);assert.equal(snap.conversations[0].messages.length,3);
    const session=await login('admin@example.test','synthetic-test');const request={cookies:{get:()=>({value:session.token})}} as any;
    assert.equal(await authenticated(request),true);await logout(request);assert.equal(await authenticated(request),false);
    await limit('test',1,60000);await assert.rejects(()=>limit('test',1,60000),(e:any)=>e.status===429);
    const fresh=await createOrder({customerName:'Expira',items:[{productId:p.id,quantity:1}]},'expire');
    await engine.query('UPDATE tray_balcao.orders SET "expiresAt"=$1 WHERE id=$2',['2000-01-01T00:00:00.000Z',fresh.id]);
    assert.equal((await snapshot()).orders.find(x=>x.id===fresh.id)?.status,'expired');assert.equal((await products()).find(x=>x.id===p.id)?.available,1);
    assert.equal((await seedDemo()).seeded,true);assert.equal((await seedDemo()).seeded,false);
    await engine.exec('SET ROLE anon');await assert.rejects(()=>rpc('products'),/permission denied/);await engine.exec('RESET ROLE');
    await engine.exec('SET ROLE authenticated');await assert.rejects(()=>rpc('sessionFind',{tokenHash:'x'}),/permission denied/);await engine.exec('RESET ROLE');
    await engine.exec('SET ROLE service_role');assert.equal((await rpc('check')).ok,true);await assert.rejects(()=>engine.query('SELECT * FROM tray_balcao.sessions'),/permission denied/);await engine.exec('RESET ROLE');
    await assert.rejects(()=>rpc('executeSQL',{sql:'DROP SCHEMA tray_balcao CASCADE'}));
    process.env.SUPABASE_SECRET_KEY='sb_publishable_invalid';await assert.rejects(()=>supabaseRpc('check'),(e:any)=>safeDiagnostic(e).code==='SUPABASE_CONFIG');
  } finally {
    globalThis.fetch=originalFetch;for(const k of Object.keys(process.env)) if(!(k in saved)) delete process.env[k]; Object.assign(process.env,saved);await engine.close();
  }
});

test('Supabase importer commits all records atomically and refuses nonempty destinations',async()=>{
  const engine=new PGlite();
  await engine.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;');
  await engine.exec(readFileSync(new URL('../supabase/INSTALAR_SUPABASE.sql',import.meta.url),'utf8'));
  const call=async(payload:any)=>(await engine.query<{result:any}>('SELECT public.tray_balcao_api($1,$2::jsonb) AS result',['importData',JSON.stringify(payload)])).rows[0].result;
  const product={id:'p1',name:'Importado',sku:'I1',description:'',price:2000,stock:3,category:'Teste',active:1,createdAt:new Date().toISOString()};
  try {
    await assert.rejects(()=>call({products:[product],messages:[{id:'m1',conversationId:'missing',direction:'in',text:'Olá',status:'received',externalId:'e1',createdAt:product.createdAt}]}));
    assert.equal((await engine.query<{n:number}>('SELECT COUNT(*)::integer AS n FROM tray_balcao.products')).rows[0].n,0);
    assert.equal((await call({products:[product]})).imported,true);
    await assert.rejects(()=>call({products:[]}));
  } finally {await engine.close();}
});
