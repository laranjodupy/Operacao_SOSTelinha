import { writeAuthCookies } from '@/lib/server/auth-cookies';
import {supabaseAuthEnabled,type AuthState} from '@/lib/server/supabase-auth';
import { safeDiagnostic } from "@/lib/server/diagnostics";
import { NextRequest, NextResponse } from "next/server";
import { requestAuth, cookieName, limit, login, logout, sameOrigin, webhookAuth, } from "@/lib/server/auth";
import { createOrder, createProductBatch, orderByToken, payDemo, products, receive, saveProduct, saveSettings, seedDemo, settings, snapshot, transitionOrder, updateConversation, expireOrders, } from "@/lib/server/store";
import { aiTask, inbound, sendMessage } from "@/lib/server/integrations";
import { HttpError, fail, record, text } from "@/lib/server/validation";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const baseJson = (value: unknown, status = 200) => NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
});
async function body(request: NextRequest) {
    const max = 4400000;
    if (Number(request.headers.get("content-length") || 0) > max)
        fail(413, "Conteúdo muito grande (máximo 4,4 MB).");
    if (!request.headers.get("content-type")?.includes("application/json"))
        fail(415, "Use Content-Type application/json.");
    const reader = request.body?.getReader();
    if (!reader)
        fail(400, "Corpo da requisição ausente.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader!.read();
        if (done)
            break;
        size += value.byteLength;
        if (size > max) {
            await reader!.cancel();
            fail(413, "Conteúdo muito grande.");
        }
        chunks.push(value);
    }
    try {
        return record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    }
    catch (error) {
        if (error instanceof HttpError)
            throw error;
        return fail(400, "JSON inválido.");
    }
}
async function handle(request: NextRequest, context: {
    params: Promise<{
        path: string[];
    }>;
}) {
    let authState:AuthState|undefined;
    const json=(value:unknown,status=200)=>{
        const res=baseJson(value,status);
        writeAuthCookies(res,authState,new URL(process.env.APP_URL||request.url).protocol==='https:');
        return res;
    };
    try {
        const { path } = await context.params, route = path.join("/"), method = request.method;
        if (route === "health" && method === "GET")
            return json({ ok: true, service: "tray-balcao" });
        if (route === "session" && method === "GET") {
            authState=await requestAuth(request);
            return json({authenticated:authState.authenticated});
        }
        if (route === "login" && method === "POST") {
            sameOrigin(request);
            // Shared persistent bucket also works behind a proxy without trusting spoofable forwarding headers.
            // Supabase Auth applies its own sign-in rate limits without depending on the Data API.
            if(!supabaseAuthEnabled()) await limit("login",30,10*60000);
            const b = await body(request), s = await login(b.email,b.password);
            if(s.refreshToken) authState={authenticated:true,tokens:{...s,refreshToken:s.refreshToken}};
            const res=json({ok:true});
            if(!s.refreshToken) res.cookies.set(cookieName,s.token,{httpOnly:true,sameSite:'strict',secure:new URL(process.env.APP_URL||request.url).protocol==='https:',path:'/',expires:new Date(s.expiresAt)});
            return res;
        }
        if (route === "logout" && method === "POST") {
            sameOrigin(request);
            (await logout(request));
            authState={authenticated:false,clear:true};
            return json({ok:true});
        }
        if (route === "webhooks/whatsapp" && method === "POST") {
            webhookAuth(request);
            (await limit("webhook", 180, 60000));
            return json((await inbound(await body(request))));
        }
        if (path[0] === "checkout" && path[1]) {
            const token = text(path[1], "Link", 100);
            if (method === "GET" && path.length === 2) {
                (await expireOrders());
                const o = (await orderByToken(token)), s = (await settings());
                return json({
                    order: {
                        number: o.number,
                        customerName: o.customerName,
                        status: o.status,
                        items: o.items,
                        subtotal: o.subtotal,
                        total: o.total,
                        delivery: o.delivery,
                        deliveryFee: o.deliveryFee,
                        expiresAt: o.expiresAt,
                        paidAt: o.paidAt,
                    },
                    store: {
                        name: s.name,
                        address: s.address,
                        pickupMinutes: s.pickupMinutes,
                        deliveryFee: s.deliveryFee,
                        deliveryEnabled: s.deliveryEnabled,
                    },
                    demo: process.env.DEMO_MODE !== "false",
                });
            }
            if (method === "POST" && path[2] === "pay" && path.length === 3) {
                sameOrigin(request);
                (await limit(`pay:${token}`, 20, 60000));
                const o = (await payDemo(token, await body(request)));
                return json({ status: o.status, number: o.number, total: o.total });
            }
        }
        authState=await requestAuth(request);
        if(!authState.authenticated) fail(401,"Entre na sua conta para continuar.");
        if (method !== "GET")
            sameOrigin(request);
        if (method === "GET" && route === "dashboard")
            return json((await snapshot()));
        if (route === "products" && method === "GET") {
            (await expireOrders());
            return json((await products()));
        }
        if (route === "products/batch" && method === "POST")
            return json((await createProductBatch(await body(request), request.headers.get("idempotency-key") || "")), 201);
        if (route === "products" && method === "POST")
            return json((await saveProduct(await body(request))), 201);
        if (path[0] === "products" && path.length === 2 && method === "PATCH")
            return json((await saveProduct(await body(request), path[1])));
        if (route === "settings" && method === "PUT")
            return json((await saveSettings(await body(request))));
        if (route === "demo/seed" && method === "POST")
            return json((await seedDemo()));
        if (route === "demo/message" && method === "POST") {
            if (process.env.DEMO_MODE === "false")
                fail(403, "Demonstração desativada.");
            return json((await receive(await body(request))));
        }
        if (path[0] === "conversations" &&
            path.length === 2 &&
            method === "PATCH") {
            (await updateConversation(path[1], await body(request)));
            return json({ ok: true });
        }
        if (path[0] === "conversations" &&
            path[2] === "messages" &&
            path.length === 3 &&
            method === "POST")
            return json(await sendMessage(path[1], await body(request), request.headers.get("idempotency-key") || ""));
        if (route === "orders" && method === "POST")
            return json((await createOrder(await body(request), request.headers.get("idempotency-key") || "")), 201);
        if (path[0] === "orders" && path.length === 2 && method === "PATCH")
            return json((await transitionOrder(path[1], await body(request))));
        if (route === "ai/test" && method === "POST") {
            (await limit("ai", 30, 60000));
            const result = await aiTask({
                task: "extract_product",
                text: "Um caderno por R$ 10,00 a unidade. Uma unidade em estoque.",
            });
            const count = "products" in result && Array.isArray(result.products)
                ? result.products.length
                : 0;
            if (!count)
                fail(409, "Selecione cloudflare ou n8n para testar a extração.");
            return json({ ok: true, provider: result.provider, draftCount: count });
        }
        if (route === "ai" && method === "POST") {
            (await limit("ai", 30, 60000));
            return json(await aiTask(await body(request)));
        }
        return json({ error: "Rota não encontrada." }, 404);
    }
    catch (error) {
        if (error instanceof HttpError)
            return json({ error: error.message }, error.status);
        if ((error as { code?: string })?.code === "23505" || (error instanceof Error &&
            error.message.includes("UNIQUE constraint failed: products.sku")))
            return json({ error: "Esse SKU já está em uso. Escolha outro código." }, 409);
        console.error("[tray-balcao]", safeDiagnostic(error));
        return json({ error: "Não foi possível concluir a operação. Tente novamente." }, 500);
    }
}
export { handle as GET, handle as POST, handle as PATCH, handle as PUT };
