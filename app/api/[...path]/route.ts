import { NextRequest, NextResponse } from "next/server";
import {
  authenticated,
  cookieName,
  limit,
  login,
  logout,
  requireAuth,
  sameOrigin,
  webhookAuth,
} from "@/lib/server/auth";
import {
  createOrder,
  orderByToken,
  payDemo,
  products,
  receive,
  saveProduct,
  saveSettings,
  seedDemo,
  settings,
  snapshot,
  transitionOrder,
  updateConversation,
  expireOrders,
} from "@/lib/server/store";
import { aiTask, inbound, sendMessage } from "@/lib/server/integrations";
import { HttpError, fail, record, text } from "@/lib/server/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
async function body(request: NextRequest) {
  const max = 6_000_000;
  if (Number(request.headers.get("content-length") || 0) > max)
    fail(413, "Conteúdo muito grande (máximo 6 MB).");
  if (!request.headers.get("content-type")?.includes("application/json"))
    fail(415, "Use Content-Type application/json.");
  const reader = request.body?.getReader();
  if (!reader) fail(400, "Corpo da requisição ausente.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader!.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader!.cancel();
      fail(413, "Conteúdo muito grande.");
    }
    chunks.push(value);
  }
  try {
    return record(JSON.parse(Buffer.concat(chunks).toString("utf8")));
  } catch (error) {
    if (error instanceof HttpError) throw error;
    return fail(400, "JSON inválido.");
  }
}
async function handle(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await context.params,
      route = path.join("/"),
      method = request.method;
    if (route === "health" && method === "GET")
      return json({ ok: true, service: "tray-balcao" });
    if (route === "session" && method === "GET")
      return json({ authenticated: authenticated(request) });
    if (route === "login" && method === "POST") {
      sameOrigin(request);
      // Shared persistent bucket also works behind a proxy without trusting spoofable forwarding headers.
      limit("login", 30, 10 * 60_000);
      const b = await body(request),
        s = login(b.email, b.password),
        res = json({ ok: true });
      res.cookies.set(cookieName, s.token, {
        httpOnly: true,
        sameSite: "strict",
        secure:
          new URL(process.env.APP_URL || request.url).protocol === "https:",
        path: "/",
        expires: new Date(s.expiresAt),
      });
      return res;
    }
    if (route === "logout" && method === "POST") {
      sameOrigin(request);
      logout(request);
      const res = json({ ok: true });
      res.cookies.set(cookieName, "", { path: "/", maxAge: 0 });
      return res;
    }
    if (route === "webhooks/whatsapp" && method === "POST") {
      webhookAuth(request);
      limit("webhook", 180, 60_000);
      return json(inbound(await body(request)));
    }
    if (path[0] === "checkout" && path[1]) {
      const token = text(path[1], "Link", 100);
      if (method === "GET" && path.length === 2) {
        expireOrders();
        const o = orderByToken(token),
          s = settings();
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
        limit(`pay:${token}`, 20, 60_000);
        const o = payDemo(token, await body(request));
        return json({ status: o.status, number: o.number, total: o.total });
      }
    }
    requireAuth(request);
    if (method !== "GET") sameOrigin(request);
    if (method === "GET" && route === "dashboard") return json(snapshot());
    if (route === "products" && method === "GET") {
      expireOrders();
      return json(products());
    }
    if (route === "products" && method === "POST")
      return json(saveProduct(await body(request)), 201);
    if (path[0] === "products" && path.length === 2 && method === "PATCH")
      return json(saveProduct(await body(request), path[1]));
    if (route === "settings" && method === "PUT")
      return json(saveSettings(await body(request)));
    if (route === "demo/seed" && method === "POST") return json(seedDemo());
    if (route === "demo/message" && method === "POST") {
      if (process.env.DEMO_MODE === "false")
        fail(403, "Demonstração desativada.");
      return json(receive(await body(request)));
    }
    if (
      path[0] === "conversations" &&
      path.length === 2 &&
      method === "PATCH"
    ) {
      updateConversation(path[1], await body(request));
      return json({ ok: true });
    }
    if (
      path[0] === "conversations" &&
      path[2] === "messages" &&
      path.length === 3 &&
      method === "POST"
    )
      return json(
        await sendMessage(
          path[1],
          await body(request),
          request.headers.get("idempotency-key") || "",
        ),
      );
    if (route === "orders" && method === "POST")
      return json(
        createOrder(
          await body(request),
          request.headers.get("idempotency-key") || "",
        ),
        201,
      );
    if (path[0] === "orders" && path.length === 2 && method === "PATCH")
      return json(transitionOrder(path[1], await body(request)));
    if (route === "ai" && method === "POST") {
      limit("ai", 30, 60_000);
      return json(await aiTask(await body(request)));
    }
    return json({ error: "Rota não encontrada." }, 404);
  } catch (error) {
    if (error instanceof HttpError)
      return json({ error: error.message }, error.status);
    if (
      error instanceof Error &&
      error.message.includes("UNIQUE constraint failed: products.sku")
    )
      return json(
        { error: "Esse SKU já está em uso. Escolha outro código." },
        409,
      );
    console.error(
      "[tray-balcao]",
      error instanceof Error ? error.name : "UnknownError",
    );
    return json(
      { error: "Não foi possível concluir a operação. Tente novamente." },
      500,
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as PUT };
