-- Tray Balcão 2.1: execute este arquivo inteiro no SQL Editor. Não apaga dados existentes.
CREATE SCHEMA IF NOT EXISTS tray_balcao;
REVOKE ALL ON SCHEMA tray_balcao FROM PUBLIC, anon, authenticated;
SET search_path TO tray_balcao;
  
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS products (id TEXT PRIMARY KEY, name TEXT NOT NULL, sku TEXT UNIQUE NOT NULL, description TEXT NOT NULL DEFAULT '', price INTEGER NOT NULL CHECK(price>0), stock INTEGER NOT NULL CHECK(stock>=0), category TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, "createdAt" TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT UNIQUE NOT NULL, source TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', unread INTEGER NOT NULL DEFAULT 0, "updatedAt" TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, "conversationId" TEXT NOT NULL REFERENCES conversations(id), direction TEXT NOT NULL, text TEXT NOT NULL, status TEXT NOT NULL, "externalId" TEXT UNIQUE, "createdAt" TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, number TEXT UNIQUE NOT NULL, "customerName" TEXT NOT NULL, "conversationId" TEXT REFERENCES conversations(id), token TEXT UNIQUE NOT NULL, status TEXT NOT NULL, items TEXT NOT NULL, subtotal BIGINT NOT NULL, "deliveryFee" INTEGER NOT NULL DEFAULT 0, total BIGINT NOT NULL, delivery TEXT NOT NULL DEFAULT 'pickup', address TEXT NOT NULL DEFAULT '', "createdAt" TEXT NOT NULL, "expiresAt" TEXT NOT NULL, "paidAt" TEXT, "idempotencyKey" TEXT UNIQUE NOT NULL, "requestHash" TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS reservations ("orderId" TEXT NOT NULL REFERENCES orders(id), "productId" TEXT NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity>0), PRIMARY KEY("orderId","productId"));
    CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, action TEXT NOT NULL, detail TEXT NOT NULL, "createdAt" TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions ("tokenHash" TEXT PRIMARY KEY, "expiresAt" TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS rate_limits (key TEXT PRIMARY KEY, count INTEGER NOT NULL, "expiresAt" BIGINT NOT NULL);
    CREATE INDEX IF NOT EXISTS messages_conversation ON messages("conversationId","createdAt");
    CREATE INDEX IF NOT EXISTS orders_status ON orders(status,"expiresAt");
    CREATE INDEX IF NOT EXISTS reservations_product ON reservations("productId");
    
ALTER TABLE meta ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE meta FROM PUBLIC, anon, authenticated;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE products FROM PUBLIC, anon, authenticated;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE conversations FROM PUBLIC, anon, authenticated;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE messages FROM PUBLIC, anon, authenticated;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE orders FROM PUBLIC, anon, authenticated;
ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE reservations FROM PUBLIC, anon, authenticated;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE audit FROM PUBLIC, anon, authenticated;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE sessions FROM PUBLIC, anon, authenticated;
ALTER TABLE rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE rate_limits FROM PUBLIC, anon, authenticated;
INSERT INTO meta(key,value) VALUES ('settings','{"name": "Minha loja", "segment": "Comércio local", "address": "", "phone": "", "pickupMinutes": 30, "deliveryFee": 0, "deliveryEnabled": false, "welcome": "Olá! Como podemos ajudar?"}') ON CONFLICT DO NOTHING;
RESET search_path;

-- Execute AFTER 001_initial.sql. Does not delete or recreate business tables.
BEGIN;
CREATE OR REPLACE FUNCTION tray_balcao.add_audit(p_action text, p_detail text)
RETURNS void LANGUAGE sql SET search_path = '' AS $$
  INSERT INTO tray_balcao.audit VALUES(gen_random_uuid()::text,p_action,left(p_detail,1500),to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
$$;
REVOKE ALL ON FUNCTION tray_balcao.add_audit(text,text) FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.tray_balcao_api(p_action text, p_payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_now text := to_char(clock_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_ms bigint := floor(extract(epoch FROM clock_timestamp())*1000);
  v_id text; v_key text; v_status text; v_number text;
  v_count bigint; v_available bigint; v_total bigint := 0; v_fee integer := 0; v_qty integer;
  v_doc jsonb; v_item jsonb; v_items jsonb := '[]'::jsonb; v_result jsonb; v_settings jsonb;
  v_row record; v_product tray_balcao.products%ROWTYPE; v_order tray_balcao.orders%ROWTYPE;
BEGIN
  IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid payload'; END IF;
  -- Shared transaction-scoped lock, also used by the optional direct Postgres adapter.
  PERFORM pg_advisory_xact_lock(748391204);
  IF p_action IN ('expire','saveProduct','batch','createOrder','payDemo','transition','snapshot') THEN
    FOR v_row IN UPDATE tray_balcao.orders SET status='expired' WHERE status='pending' AND "expiresAt"<=v_now RETURNING id,number LOOP
      DELETE FROM tray_balcao.reservations WHERE "orderId"=v_row.id;
      PERFORM tray_balcao.add_audit('order.expired',v_row.number || ': reserva liberada');
    END LOOP;
  END IF;
  CASE p_action
  WHEN 'check' THEN
    -- Referencing each table catches incomplete migrations without returning customer data.
    PERFORM 1 FROM tray_balcao.products LIMIT 1; PERFORM 1 FROM tray_balcao.orders LIMIT 1;
    PERFORM 1 FROM tray_balcao.conversations LIMIT 1; PERFORM 1 FROM tray_balcao.messages LIMIT 1;
    PERFORM 1 FROM tray_balcao.reservations LIMIT 1; PERFORM 1 FROM tray_balcao.sessions LIMIT 1;
    PERFORM 1 FROM tray_balcao.rate_limits LIMIT 1; PERFORM 1 FROM tray_balcao.audit LIMIT 1;
    IF NOT EXISTS(SELECT 1 FROM tray_balcao.meta WHERE key='settings') THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Settings missing'; END IF;
    RETURN jsonb_build_object('ok',true,'transport','supabase-data-api');
  WHEN 'expire' THEN RETURN '{}'::jsonb;
  WHEN 'audit' THEN
    PERFORM tray_balcao.add_audit(p_payload->>'action',p_payload->>'detail'); RETURN '{}'::jsonb;
  WHEN 'settings' THEN
    SELECT value::jsonb INTO v_doc FROM tray_balcao.meta WHERE key='settings'; RETURN v_doc;
  WHEN 'saveSettings' THEN
    UPDATE tray_balcao.meta SET value=(p_payload->'settings')::text WHERE key='settings';
    PERFORM tray_balcao.add_audit('store.updated','Dados da loja atualizados'); RETURN p_payload->'settings';
  WHEN 'products' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q."createdAt" DESC,q.name),'[]'::jsonb) INTO v_result FROM
      (SELECT p.id,p.name,p.sku,p.description,p.price,p.stock,p.category,p.active<>0 AS active,p."createdAt",
       coalesce((SELECT sum(quantity) FROM tray_balcao.reservations r WHERE r."productId"=p.id),0) AS reserved,
       p.stock-coalesce((SELECT sum(quantity) FROM tray_balcao.reservations r WHERE r."productId"=p.id),0) AS available
       FROM tray_balcao.products p) q;
    RETURN v_result;
  WHEN 'saveProduct' THEN
    v_doc := p_payload->'product'; v_id := v_doc->>'id';
    IF p_payload->>'editId' IS NOT NULL THEN
      IF NOT EXISTS(SELECT 1 FROM tray_balcao.products WHERE id=v_id) THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Product missing'; END IF;
      SELECT coalesce(sum(quantity),0) INTO v_count FROM tray_balcao.reservations WHERE "productId"=v_id;
      IF (v_doc->>'stock')::integer < v_count THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Reserved inventory'; END IF;
      UPDATE tray_balcao.products SET name=v_doc->>'name',sku=v_doc->>'sku',description=v_doc->>'description',
        price=(v_doc->>'price')::integer,stock=(v_doc->>'stock')::integer,category=v_doc->>'category',active=CASE WHEN (v_doc->>'active')::boolean THEN 1 ELSE 0 END WHERE id=v_id;
    ELSE
      INSERT INTO tray_balcao.products VALUES(v_id,v_doc->>'name',v_doc->>'sku',v_doc->>'description',(v_doc->>'price')::integer,(v_doc->>'stock')::integer,v_doc->>'category',CASE WHEN (v_doc->>'active')::boolean THEN 1 ELSE 0 END,v_now);
    END IF;
    PERFORM tray_balcao.add_audit(CASE WHEN p_payload->>'editId' IS NULL THEN 'product.created' ELSE 'product.updated' END,v_doc->>'name');
    SELECT e INTO v_result FROM jsonb_array_elements(public.tray_balcao_api('products')) e WHERE e->>'id'=v_id;
    RETURN v_result;
  WHEN 'batch' THEN
    v_key := 'catalog_batch:' || (p_payload->>'key');
    SELECT value::jsonb INTO v_doc FROM tray_balcao.meta WHERE key=v_key;
    IF FOUND THEN
      IF v_doc->>'hash' <> p_payload->>'hash' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Batch replay conflict'; END IF;
      RETURN jsonb_build_object('ids',v_doc->'ids','count',jsonb_array_length(v_doc->'ids'),'duplicate',true);
    END IF;
    v_items := '[]'::jsonb;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'products') LOOP
      PERFORM public.tray_balcao_api('saveProduct',jsonb_build_object('product',v_item));
      v_items := v_items || jsonb_build_array(v_item->>'id');
    END LOOP;
    INSERT INTO tray_balcao.meta VALUES(v_key,jsonb_build_object('hash',p_payload->>'hash','ids',v_items)::text);
    PERFORM tray_balcao.add_audit('catalog.batch',jsonb_array_length(v_items)::text || ' produtos cadastrados');
    RETURN jsonb_build_object('ids',v_items,'count',jsonb_array_length(v_items),'duplicate',false);
  WHEN 'conversations' THEN
    SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q."updatedAt" DESC),'[]'::jsonb) INTO v_result FROM
      (SELECT c.*,coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'direction',m.direction,'text',m.text,'status',m.status,'createdAt',m."createdAt") ORDER BY m."createdAt",m.id) FROM tray_balcao.messages m WHERE m."conversationId"=c.id),'[]'::jsonb) AS messages FROM tray_balcao.conversations c) q;
    RETURN v_result;
  WHEN 'receive' THEN
    SELECT "conversationId" INTO v_id FROM tray_balcao.messages WHERE "externalId"=p_payload->>'externalId';
    IF FOUND THEN RETURN jsonb_build_object('conversationId',v_id,'duplicate',true); END IF;
    SELECT id INTO v_id FROM tray_balcao.conversations WHERE phone=p_payload->>'phone';
    IF NOT FOUND THEN
      v_id := gen_random_uuid()::text;
      INSERT INTO tray_balcao.conversations VALUES(v_id,p_payload->>'name',p_payload->>'phone',p_payload->>'source','open',0,v_now);
    END IF;
    UPDATE tray_balcao.conversations SET name=p_payload->>'name',unread=unread+1,status='open',"updatedAt"=v_now WHERE id=v_id;
    INSERT INTO tray_balcao.messages VALUES(gen_random_uuid()::text,v_id,'in',p_payload->>'text','received',p_payload->>'externalId',v_now);
    PERFORM tray_balcao.add_audit('message.received','Mensagem recebida');
    RETURN jsonb_build_object('conversationId',v_id,'duplicate',false);
  WHEN 'updateConversation' THEN
    IF p_payload->>'status' NOT IN ('open','closed') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid status'; END IF;
    UPDATE tray_balcao.conversations SET unread=0,status=p_payload->>'status' WHERE id=p_payload->>'id';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Conversation missing'; END IF; RETURN '{}'::jsonb;
  WHEN 'orderById','orderByToken' THEN
    SELECT * INTO v_order FROM tray_balcao.orders WHERE
      (p_action='orderById' AND id=p_payload->>'id') OR (p_action='orderByToken' AND token=p_payload->>'token');
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Order missing'; END IF;
    RETURN (to_jsonb(v_order)-'idempotencyKey'-'requestHash') || jsonb_build_object('items',v_order.items::jsonb);
  WHEN 'createOrder' THEN
    SELECT * INTO v_order FROM tray_balcao.orders WHERE "idempotencyKey"=p_payload->>'key';
    IF FOUND THEN
      IF v_order."requestHash"<>p_payload->>'hash' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Order replay conflict'; END IF;
      RETURN public.tray_balcao_api('orderById',jsonb_build_object('id',v_order.id));
    END IF;
    IF p_payload->>'conversationId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM tray_balcao.conversations WHERE id=p_payload->>'conversationId') THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Conversation missing'; END IF;
    IF jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid items'; END IF;
    IF (SELECT count(DISTINCT e->>'productId') FROM jsonb_array_elements(p_payload->'items') e) <> jsonb_array_length(p_payload->'items') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Duplicate item'; END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
      v_qty := (v_item->>'quantity')::integer;
      IF v_qty NOT BETWEEN 1 AND 999 THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid quantity'; END IF;
      SELECT * INTO v_product FROM tray_balcao.products WHERE id=v_item->>'productId' AND active=1;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Product unavailable'; END IF;
      SELECT v_product.stock-coalesce(sum(quantity),0) INTO v_available FROM tray_balcao.reservations WHERE "productId"=v_product.id;
      IF v_available<v_qty THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Insufficient stock'; END IF;
      v_items := v_items || jsonb_build_array(jsonb_build_object('productId',v_product.id,'quantity',v_qty,'name',v_product.name,'unitPrice',v_product.price));
      v_total := v_total + v_product.price::bigint*v_qty;
    END LOOP;
    SELECT 'TB-' || lpad((count(*)+1)::text,greatest(4,length((count(*)+1)::text)),'0') INTO v_number FROM tray_balcao.orders;
    v_id := p_payload->>'id';
    INSERT INTO tray_balcao.orders VALUES(v_id,v_number,p_payload->>'customerName',p_payload->>'conversationId',p_payload->>'token','pending',v_items::text,v_total,0,v_total,'pickup','',v_now,to_char((clock_timestamp()+interval '30 minutes') AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),NULL,p_payload->>'key',p_payload->>'hash');
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
      INSERT INTO tray_balcao.reservations VALUES(v_id,v_item->>'productId',(v_item->>'quantity')::integer);
    END LOOP;
    PERFORM tray_balcao.add_audit('order.created',v_number || ': estoque reservado por 30 minutos');
    RETURN public.tray_balcao_api('orderById',jsonb_build_object('id',v_id));
  WHEN 'payDemo' THEN
    SELECT * INTO v_order FROM tray_balcao.orders WHERE token=p_payload->>'token';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Order missing'; END IF;
    IF v_order.status IN ('paid','preparing','ready','delivered') THEN RETURN public.tray_balcao_api('orderById',jsonb_build_object('id',v_order.id)); END IF;
    IF v_order.status<>'pending' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Order unavailable'; END IF;
    IF p_payload->>'delivery' NOT IN ('local','pickup') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid delivery'; END IF;
    SELECT value::jsonb INTO v_settings FROM tray_balcao.meta WHERE key='settings';
    IF p_payload->>'delivery'='local' THEN
      IF NOT (v_settings->>'deliveryEnabled')::boolean THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Delivery disabled'; END IF;
      v_fee := (v_settings->>'deliveryFee')::integer;
    END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_order.items::jsonb) LOOP
      v_qty := (v_item->>'quantity')::integer;
      UPDATE tray_balcao.products SET stock=stock-v_qty WHERE id=v_item->>'productId' AND stock>=v_qty;
      IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Insufficient stock'; END IF;
    END LOOP;
    UPDATE tray_balcao.orders SET status='paid',"paidAt"=v_now,delivery=p_payload->>'delivery',address=p_payload->>'address',"deliveryFee"=v_fee,total=subtotal+v_fee WHERE id=v_order.id;
    DELETE FROM tray_balcao.reservations WHERE "orderId"=v_order.id;
    PERFORM tray_balcao.add_audit('payment.simulated',v_order.number || ': pagamento de demonstração confirmado');
    RETURN public.tray_balcao_api('orderById',jsonb_build_object('id',v_order.id));
  WHEN 'transition' THEN
    SELECT * INTO v_order FROM tray_balcao.orders WHERE id=p_payload->>'id';
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Order missing'; END IF;
    v_status := p_payload->>'status';
    IF NOT coalesce((v_order.status='pending' AND v_status='cancelled') OR (v_order.status='paid' AND v_status='preparing') OR (v_order.status='preparing' AND v_status=CASE WHEN v_order.delivery='pickup' THEN 'ready' ELSE 'delivered' END) OR (v_order.status='ready' AND v_status='delivered'),false) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Invalid transition'; END IF;
    UPDATE tray_balcao.orders SET status=v_status WHERE id=v_order.id;
    IF v_status='cancelled' THEN DELETE FROM tray_balcao.reservations WHERE "orderId"=v_order.id; END IF;
    PERFORM tray_balcao.add_audit('order.status',v_order.number || ': ' || v_status);
    RETURN public.tray_balcao_api('orderById',jsonb_build_object('id',v_order.id));
  WHEN 'snapshot' THEN
    SELECT coalesce(jsonb_agg((to_jsonb(o)-'idempotencyKey'-'requestHash') || jsonb_build_object('items',o.items::jsonb) ORDER BY o."createdAt" DESC),'[]'::jsonb) INTO v_items FROM tray_balcao.orders o;
    SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) INTO v_doc FROM (SELECT * FROM tray_balcao.audit ORDER BY "createdAt" DESC,id DESC LIMIT 80) q;
    RETURN jsonb_build_object('products',public.tray_balcao_api('products'),'conversations',public.tray_balcao_api('conversations'),'orders',v_items,'settings',public.tray_balcao_api('settings'),'audit',v_doc);
  WHEN 'limit' THEN
    DELETE FROM tray_balcao.rate_limits WHERE "expiresAt"<v_ms;
    INSERT INTO tray_balcao.rate_limits VALUES(p_payload->>'key',1,v_ms+(p_payload->>'windowMs')::bigint)
      ON CONFLICT(key) DO UPDATE SET count=tray_balcao.rate_limits.count+1 RETURNING count INTO v_count;
    RETURN jsonb_build_object('count',v_count);
  WHEN 'sessionCreate' THEN
    DELETE FROM tray_balcao.sessions WHERE "expiresAt"<v_now;
    INSERT INTO tray_balcao.sessions VALUES(p_payload->>'tokenHash',p_payload->>'expiresAt'); RETURN '{}'::jsonb;
  WHEN 'sessionFind' THEN
    RETURN to_jsonb(EXISTS(SELECT 1 FROM tray_balcao.sessions WHERE "tokenHash"=p_payload->>'tokenHash' AND "expiresAt">v_now));
  WHEN 'sessionDelete' THEN
    DELETE FROM tray_balcao.sessions WHERE "tokenHash"=p_payload->>'tokenHash'; RETURN '{}'::jsonb;
  WHEN 'conversationById' THEN
    SELECT to_jsonb(c) INTO v_doc FROM tray_balcao.conversations c WHERE id=p_payload->>'id'; RETURN v_doc;
  WHEN 'messageByExternalId' THEN
    SELECT to_jsonb(m) INTO v_doc FROM tray_balcao.messages m WHERE "externalId"=p_payload->>'externalId'; RETURN v_doc;
  WHEN 'reserveMessage' THEN
    SELECT to_jsonb(m) INTO v_doc FROM tray_balcao.messages m WHERE "externalId"=p_payload->>'externalId';
    IF FOUND THEN
      IF v_doc->>'conversationId'<>p_payload->>'conversationId' OR v_doc->>'text'<>p_payload->>'text' THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Message replay conflict'; END IF;
      RETURN jsonb_build_object('id',v_doc->>'id','status',v_doc->>'status','duplicate',true);
    END IF;
    IF NOT EXISTS(SELECT 1 FROM tray_balcao.conversations WHERE id=p_payload->>'conversationId') THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='Conversation missing'; END IF;
    INSERT INTO tray_balcao.messages VALUES(p_payload->>'id',p_payload->>'conversationId','out',p_payload->>'text','sending',p_payload->>'externalId',v_now);
    UPDATE tray_balcao.conversations SET "updatedAt"=v_now,unread=0 WHERE id=p_payload->>'conversationId';
    RETURN jsonb_build_object('duplicate',false);
  WHEN 'markMessage' THEN
    IF p_payload->>'status' NOT IN ('simulated','accepted','failed','uncertain') THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Invalid message status'; END IF;
    UPDATE tray_balcao.messages SET status=p_payload->>'status' WHERE id=p_payload->>'id';
    PERFORM tray_balcao.add_audit('whatsapp.' || (p_payload->>'status'),'Envio processado'); RETURN '{}'::jsonb;
  WHEN 'importData' THEN
    IF EXISTS(SELECT 1 FROM tray_balcao.products) OR EXISTS(SELECT 1 FROM tray_balcao.conversations) OR EXISTS(SELECT 1 FROM tray_balcao.orders) OR EXISTS(SELECT 1 FROM tray_balcao.messages) OR EXISTS(SELECT 1 FROM tray_balcao.reservations) OR EXISTS(SELECT 1 FROM tray_balcao.audit) THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='Destination must be empty'; END IF;
    INSERT INTO tray_balcao.products SELECT * FROM jsonb_populate_recordset(NULL::tray_balcao.products,coalesce(p_payload->'products','[]'::jsonb));
    INSERT INTO tray_balcao.conversations SELECT * FROM jsonb_populate_recordset(NULL::tray_balcao.conversations,coalesce(p_payload->'conversations','[]'::jsonb));
    INSERT INTO tray_balcao.messages SELECT * FROM jsonb_populate_recordset(NULL::tray_balcao.messages,coalesce(p_payload->'messages','[]'::jsonb));
    INSERT INTO tray_balcao.orders SELECT * FROM jsonb_populate_recordset(NULL::tray_balcao.orders,coalesce(p_payload->'orders','[]'::jsonb));
    INSERT INTO tray_balcao.reservations SELECT * FROM jsonb_populate_recordset(NULL::tray_balcao.reservations,coalesce(p_payload->'reservations','[]'::jsonb));
    INSERT INTO tray_balcao.audit SELECT * FROM jsonb_populate_recordset(NULL::tray_balcao.audit,coalesce(p_payload->'audit','[]'::jsonb));
    INSERT INTO tray_balcao.meta SELECT * FROM jsonb_populate_recordset(NULL::tray_balcao.meta,coalesce(p_payload->'meta','[]'::jsonb)) WHERE true ON CONFLICT(key) DO UPDATE SET value=excluded.value;
    RETURN jsonb_build_object('imported',true);
  WHEN 'seed' THEN
    IF EXISTS(SELECT 1 FROM tray_balcao.meta WHERE key='demoSeeded') THEN RETURN jsonb_build_object('seeded',false); END IF;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'products') LOOP
      IF NOT EXISTS(SELECT 1 FROM tray_balcao.products WHERE sku=v_item->>'sku') THEN PERFORM public.tray_balcao_api('saveProduct',jsonb_build_object('product',v_item)); END IF;
    END LOOP;
    INSERT INTO tray_balcao.meta VALUES('demoSeeded','true');
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'conversations') LOOP PERFORM public.tray_balcao_api('receive',v_item); END LOOP;
    PERFORM tray_balcao.add_audit('demo.loaded','Exemplos adicionados'); RETURN jsonb_build_object('seeded',true);
  ELSE RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='Unsupported operation';
  END CASE;
END;
$$;
REVOKE ALL ON FUNCTION public.tray_balcao_api(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tray_balcao_api(text,jsonb) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
