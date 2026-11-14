import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { db, transaction } from "../lib/server/db.ts";
import { createOrder, createProductBatch, expireOrders, orderByToken, payDemo, products, receive, saveProduct, seedDemo, snapshot, transitionOrder, } from "../lib/server/store.ts";
import { inbound, aiTask, sendMessage } from "../lib/server/integrations.ts";
import { secureEqual, login, limit } from "../lib/server/auth.ts";
import { integrationUrl } from "../lib/server/integration-config.ts";
process.env.DATABASE_PATH = ":memory:";
process.env.DEMO_MODE = "true";
process.env.AI_PROVIDER = "local";
process.env.WHATSAPP_PROVIDER = "demo";
beforeEach(async () => {
    process.env.AI_PROVIDER = 'local';
    process.env.WHATSAPP_PROVIDER = 'demo';
    process.env.DEMO_MODE = 'true';
    process.env.CLOUDFLARE_ACCOUNT_ID = 'test-account';
    process.env.CLOUDFLARE_API_TOKEN = 'test-only';
    process.env.N8N_AI_WEBHOOK_URL = 'https://n8n.example.test/webhook/ai';
    process.env.N8N_AI_SECRET = 'test-only';
    process.env.WHATSAPP_BASE_URL = 'https://evolution.example.test';
    process.env.WHATSAPP_API_KEY = 'test-only';
    process.env.WHATSAPP_INSTANCE = 'shop';
    delete process.env.ALLOW_INSECURE_LOCAL_INTEGRATIONS;
    (await db().exec("DELETE FROM reservations;DELETE FROM orders;DELETE FROM messages;DELETE FROM conversations;DELETE FROM products;DELETE FROM audit;DELETE FROM sessions;DELETE FROM rate_limits;DELETE FROM meta WHERE key='demoSeeded' OR key LIKE 'catalog_batch:%';"));
});
const product = async (stock = 4) => (await saveProduct({
    name: "Caderno 10 Matérias",
    sku: "CAD-001",
    description: "Capa dura",
    price: 2490,
    stock,
    category: "Cadernos",
    active: true,
}));
const order = async (p: Awaited<ReturnType<typeof product>>, quantity = 1, key = "key-1") => (await createOrder({ customerName: "Daniel", items: [{ productId: p.id, quantity }] }, key));
test("reserve, delivery payment and replay preserve cents and decrement inventory exactly once", async () => {
    const p = (await product()), o = (await order(p, 2));
    assert.equal(o.total, 4980);
    assert.equal((await products())[0].stock, 4);
    assert.equal((await products())[0].reserved, 2);
    assert.equal((await products())[0].available, 2);
    const paid = (await payDemo(o.token, {
        delivery: "local",
        address: "Rua de Teste, 10",
    }));
    assert.equal(paid.total, 5580);
    assert.equal(paid.status, "paid");
    assert.equal((await products())[0].stock, 2);
    assert.equal((await products())[0].reserved, 0);
    (await payDemo(o.token, { delivery: "pickup" }));
    assert.equal((await products())[0].stock, 2);
    assert.equal((await orderByToken(o.token)).total, 5580);
    assert.equal((await snapshot()).metrics.revenue, 5580);
});
test("prevents overselling and duplicate line items", async () => {
    const p = (await product(1));
    (await order(p));
    (await assert.rejects(async () => (await order(p, 1, "another")), /Estoque insuficiente/));
    (await assert.rejects(async () => (await createOrder({
        customerName: "Ana",
        items: [
            { productId: p.id, quantity: 1 },
            { productId: p.id, quantity: 1 },
        ],
    }, "dupe")), /Agrupe/));
    assert.equal((await products())[0].available, 0);
});
test("idempotent creation returns same order and rejects different payloads", async () => {
    const p = (await product()), o = (await order(p));
    assert.equal((await order(p)).id, o.id);
    assert.equal((await snapshot()).orders.length, 1);
    (await assert.rejects(async () => (await order(p, 2)), /outro pedido/));
    assert.equal((await products())[0].reserved, 1);
});
test("expiry and cancellation release only their own reservations", async () => {
    const p = (await product(5)), a = (await order(p, 2)), b = (await order(p, 1, "b"));
    (await db()
        .prepare("UPDATE orders SET expiresAt=? WHERE id=?")
        .run("2000-01-01T00:00:00.000Z", a.id));
    (await expireOrders());
    assert.equal((await orderByToken(a.token)).status, "expired");
    assert.equal((await products())[0].reserved, 1);
    (await assert.rejects(async () => (await payDemo(a.token, { delivery: "pickup" })), /não está mais disponível/));
    (await transitionOrder(b.id, { status: "cancelled" }));
    assert.equal((await products())[0].available, 5);
});
test("physical inventory cannot drop below reservations; snapshots survive price edits", async () => {
    const p = (await product(4)), o = (await order(p, 2));
    (await assert.rejects(async () => (await saveProduct({ ...p, stock: 1 }, p.id)), /reservadas/));
    (await saveProduct({ ...p, price: 9999, stock: 4 }, p.id));
    assert.equal((await orderByToken(o.token)).subtotal, 4980);
    assert.equal((await payDemo(o.token, { delivery: "pickup" })).total, 4980);
});
test("payment and fulfillment transitions cannot be forged through status API", async () => {
    const p = (await product()), o = (await order(p));
    (await assert.rejects(async () => (await transitionOrder(o.id, { status: "paid" })), /não permitida/));
    (await payDemo(o.token, { delivery: "pickup" }));
    (await transitionOrder(o.id, { status: "preparing" }));
    (await transitionOrder(o.id, { status: "ready" }));
    (await transitionOrder(o.id, { status: "delivered" }));
    (await assert.rejects(async () => (await transitionOrder(o.id, { status: "cancelled" })), /não permitida/));
});
test("transaction rollback restores all writes on a failure", async () => {
    const p = (await product());
    (await assert.rejects(async () => (await transaction(async () => {
        (await db().prepare("UPDATE products SET stock=0 WHERE id=?").run(p.id));
        throw new Error("rollback");
    }))));
    assert.equal((await products())[0].stock, 4);
});
test("normalised webhook is idempotent and Evolution ignores outbound/groups", async () => {
    const input = {
        phone: "5579999999999",
        name: "Ana",
        text: "Tem caderno?",
        externalId: "event-1",
    };
    const a = (await inbound(input)), b = (await inbound(input));
    assert.equal((a as any).conversationId, (b as any).conversationId);
    assert.equal((b as any).duplicate, true);
    assert.equal((await snapshot()).conversations[0].messages.length, 1);
    assert.deepEqual((await inbound({ event: "messages.upsert", data: { key: { fromMe: true } } })), { ignored: true });
    assert.deepEqual((await inbound({
        event: "messages.upsert",
        data: { key: { remoteJid: "123@g.us" } },
    })), { ignored: true });
    (await inbound({
        event: "messages.upsert",
        instance: "shop",
        data: {
            key: { id: "abc", remoteJid: "5579999999999@s.whatsapp.net" },
            pushName: "Ana",
            message: { extendedTextMessage: { text: "Olá!" } },
        },
    }));
    assert.equal((await snapshot()).conversations[0].messages.length, 2);
});
test("local suggestions disclose local matching and never pretend to extract photographs", async () => {
    const p = (await product());
    const result = (await aiTask({
        task: "suggest",
        text: "Vocês têm caderno?",
    })) as any;
    assert.equal(result.provider, "local");
    assert.equal(result.items[0].productId, p.id);
    await assert.rejects(async () => (await aiTask({ task: "extract_product", text: "caderno 20 reais" })), /configure AI_PROVIDER/);
});
test("outbound messages deduplicate by key without resending", async () => {
    const c = (await receive({
        name: "Ana",
        phone: "5579999999999",
        text: "Olá",
        externalId: "in",
    }));
    const a = await sendMessage(c.conversationId, { text: "Resposta" }, "out-1"), b = await sendMessage(c.conversationId, { text: "Resposta" }, "out-1");
    assert.equal(a.status, "simulated");
    assert.equal(b.duplicate, true);
    assert.equal((await snapshot()).conversations[0].messages.length, 2);
    await assert.rejects(async () => (await sendMessage(c.conversationId, { text: "Diferente" }, "out-1")), /já usada/);
});
test("demo seed is additive and repeat safe", async () => {
    const p = (await product());
    (await seedDemo());
    (await seedDemo());
    assert.ok((await products()).some((x) => x.id === p.id));
    assert.equal((await snapshot()).conversations.length, 2);
});
test("no simulation payments when demo mode is off", async () => {
    const p = (await product()), o = (await order(p));
    process.env.DEMO_MODE = "false";
    try {
        (await assert.rejects(async () => (await payDemo(o.token, { delivery: "pickup" })), /desativado/));
        (await assert.rejects(async () => (await seedDemo()), /desativado/));
    }
    finally {
        process.env.DEMO_MODE = "true";
    }
    assert.equal((await products())[0].stock, 4);
});
test("credential comparison and bounded login attempts", async () => {
    process.env.ADMIN_EMAIL = "admin@example.test";
    process.env.ADMIN_PASSWORD = "test-password-only";
    assert.equal(secureEqual("a", "a"), true);
    assert.equal(secureEqual("a", "b"), false);
    (await assert.rejects(async () => (await login("admin@example.test", "wrong")), /incorretos/));
    assert.ok((await login("ADMIN@example.test", "test-password-only")).token);
    (await limit("test", 1, 1000));
    (await assert.rejects(async () => (await limit("test", 1, 1000)), /Muitas tentativas/));
});
test("rejects fractional money, negative inventory and SQL-like payloads remain inert", async () => {
    (await assert.rejects(async () => (await saveProduct({
        name: "N",
        sku: "X",
        description: "",
        price: 24.9,
        stock: 2,
        category: "X",
    })), /Preço/));
    const p = (await product());
    (await assert.rejects(async () => (await saveProduct({ ...p, stock: -1 }, p.id)), /Estoque/));
    (await saveProduct({ ...p, name: "Teste'; DROP TABLE products;--" }, p.id));
    assert.equal((await products()).length, 1);
});
test("n8n adapter sends authenticated server requests and validates its response", async () => {
    const p = (await product()), original = globalThis.fetch;
    process.env.AI_PROVIDER = "n8n";
    process.env.N8N_AI_WEBHOOK_URL = "https://n8n.example.test/webhook/ai";
    process.env.N8N_AI_SECRET = "test-only";
    globalThis.fetch = (async (url, init) => {
        assert.equal(String(url), process.env.N8N_AI_WEBHOOK_URL);
        assert.equal((init!.headers as any)["x-ai-secret"], "test-only");
        const body = JSON.parse(init!.body as string);
        assert.equal(body.task, "suggest");
        assert.equal(body.catalog[0].id, p.id);
        return Response.json({
            items: [{ productId: p.id, quantity: 2 }],
            reply: "Confira os itens.",
        });
    }) as typeof fetch;
    try {
        const r = (await aiTask({ task: "suggest", text: "Dois cadernos" })) as any;
        assert.equal(r.provider, "n8n");
        assert.equal(r.items[0].quantity, 2);
    }
    finally {
        globalThis.fetch = original;
        process.env.AI_PROVIDER = "local";
    }
});
test("external AI never gets to invent product IDs or change inventory", async () => {
    const p = (await product()), original = globalThis.fetch;
    process.env.AI_PROVIDER = "n8n";
    globalThis.fetch = (async () => Response.json({
        items: [{ productId: "invented", quantity: 1 }],
        reply: "Olá",
    })) as typeof fetch;
    try {
        await assert.rejects(async () => (await aiTask({ task: "suggest", text: "caderno" })), /fora do catálogo/);
        assert.equal((await products())[0].stock, p.stock);
    }
    finally {
        globalThis.fetch = original;
        process.env.AI_PROVIDER = "local";
    }
});
test("direct Workers AI adapter sends image payload to vision model and validates cents", async () => {
    const original = globalThis.fetch;
    process.env.AI_PROVIDER = "cloudflare";
    process.env.CLOUDFLARE_ACCOUNT_ID = "test-account";
    process.env.CLOUDFLARE_API_TOKEN = "test-only";
    globalThis.fetch = (async (url, init) => {
        assert.ok(String(url).includes("llama-3.2-11b-vision-instruct"));
        const body = JSON.parse(init!.body as string);
        assert.ok(body.image.startsWith("data:image/png;base64,"));
        assert.equal((init!.headers as any).Authorization, "Bearer test-only");
        return Response.json({
            result: {
                response: JSON.stringify({
                    product: {
                        name: "Caderno",
                        description: "Capa dura",
                        price: 2490,
                        stock: 5,
                        category: "Cadernos",
                    },
                }),
            },
        });
    }) as typeof fetch;
    try {
        const r = (await aiTask({
            task: "extract_product",
            image: { mimeType: "image/png", dataBase64: "AAAA" },
        })) as any;
        assert.equal(r.product.price, 2490);
        assert.equal((await products()).length, 0);
    }
    finally {
        globalThis.fetch = original;
        process.env.AI_PROVIDER = "local";
    }
});
test("Evolution adapter uses documented path and never sends to fictitious conversations", async () => {
    const original = globalThis.fetch;
    process.env.WHATSAPP_PROVIDER = "evolution";
    process.env.WHATSAPP_BASE_URL = "https://evolution.example.test";
    process.env.WHATSAPP_API_KEY = "test-only";
    process.env.WHATSAPP_INSTANCE = "shop";
    let calls = 0;
    globalThis.fetch = (async (url, init) => {
        calls++;
        assert.equal(String(url), "https://evolution.example.test/message/sendText/shop");
        assert.deepEqual(JSON.parse(init!.body as string), {
            number: "5579999999999",
            text: "Teste",
        });
        return Response.json({ key: { id: "provider-id" } });
    }) as typeof fetch;
    try {
        const fake = (await receive({
            name: "Fictício",
            phone: "5579999999998",
            text: "Oi",
            externalId: "fake",
        }, "demo"));
        await assert.rejects(async () => (await sendMessage(fake.conversationId, { text: "Teste" }, "key-fake")), /fictícias/);
        assert.equal(calls, 0);
        const real = (await receive({
            name: "Teste",
            phone: "5579999999999",
            text: "Oi",
            externalId: "event",
        }, "webhook"));
        assert.equal((await sendMessage(real.conversationId, { text: "Teste" }, "real-key"))
            .status, "accepted");
        await sendMessage(real.conversationId, { text: "Teste" }, "real-key");
        assert.equal(calls, 1);
    }
    finally {
        globalThis.fetch = original;
        process.env.WHATSAPP_PROVIDER = "demo";
    }
});
test("unknown delivery outcome is retained and replay does not resend", async () => {
    const original = globalThis.fetch;
    process.env.WHATSAPP_PROVIDER = "evolution";
    let calls = 0;
    globalThis.fetch = (async () => {
        calls++;
        throw new Error("timeout");
    }) as typeof fetch;
    try {
        const c = (await receive({
            name: "Teste",
            phone: "5579999999999",
            text: "Oi",
            externalId: "event",
        }, "webhook"));
        assert.equal((await sendMessage(c.conversationId, { text: "Teste" }, "uncertain-key"))
            .status, "uncertain");
        await sendMessage(c.conversationId, { text: "Teste" }, "uncertain-key");
        assert.equal(calls, 1);
    }
    finally {
        globalThis.fetch = original;
        process.env.WHATSAPP_PROVIDER = "demo";
    }
});
test("local site may call HTTPS Cloudflare; localhost n8n requires explicit HTTP allowance", () => {
    const old = process.env.ALLOW_INSECURE_LOCAL_INTEGRATIONS;
    try {
        process.env.ALLOW_INSECURE_LOCAL_INTEGRATIONS = "false";
        assert.equal(integrationUrl("https://api.cloudflare.com/client/v4/", "Workers AI")
            .protocol, "https:");
        assert.throws(() => integrationUrl("http://localhost:5678/webhook/ai", "N8N_AI_WEBHOOK_URL"), /ALLOW_INSECURE_LOCAL_INTEGRATIONS=true/);
        process.env.ALLOW_INSECURE_LOCAL_INTEGRATIONS = "true";
        assert.equal(integrationUrl("http://localhost:5678/webhook/ai", "n8n").protocol, "http:");
        assert.throws(() => integrationUrl("http://remote.example.test/webhook/ai", "n8n"), /HTTPS/);
        assert.throws(() => integrationUrl("ftp://localhost/ai", "n8n"), /HTTPS/);
        assert.throws(() => integrationUrl("not-a-url", "n8n"), /URL completa/);
    }
    finally {
        if (old === undefined)
            delete process.env.ALLOW_INSECURE_LOCAL_INTEGRATIONS;
        else
            process.env.ALLOW_INSECURE_LOCAL_INTEGRATIONS = old;
    }
});
test("n8n HTTP configuration errors are raised before any network call", async () => {
    const original = fetch, old = process.env.ALLOW_INSECURE_LOCAL_INTEGRATIONS;
    process.env.AI_PROVIDER = "n8n";
    process.env.N8N_AI_WEBHOOK_URL = "http://localhost:5678/webhook/ai";
    process.env.N8N_AI_SECRET = "test";
    process.env.ALLOW_INSECURE_LOCAL_INTEGRATIONS = "false";
    let calls = 0;
    globalThis.fetch = (async () => {
        calls++;
        throw new Error("Must not call");
    }) as typeof fetch;
    try {
        await assert.rejects(async () => (await aiTask({ task: "extract_product", text: "um caderno" })), /N8N_AI_WEBHOOK_URL.*ALLOW_INSECURE/);
        assert.equal(calls, 0);
    }
    finally {
        globalThis.fetch = original;
        process.env.AI_PROVIDER = "local";
        process.env.N8N_AI_WEBHOOK_URL = "https://n8n.example.test/webhook/ai";
        if (old === undefined)
            delete process.env.ALLOW_INSECURE_LOCAL_INTEGRATIONS;
        else
            process.env.ALLOW_INSECURE_LOCAL_INTEGRATIONS = old;
    }
});
test("extracts all listed products into review drafts without writing to catalog", async () => {
    const original = fetch;
    process.env.AI_PROVIDER = "cloudflare";
    globalThis.fetch = (async () => Response.json({
        result: {
            response: JSON.stringify({
                products: [
                    {
                        name: "Calculadora modelo 240",
                        price: 1000,
                        stock: 10,
                        category: "Calculadoras",
                    },
                    { name: "Caderno", price: 2490, stock: 8, category: "Cadernos" },
                ],
            }),
        },
    })) as typeof fetch;
    try {
        const r = (await aiTask({
            task: "extract_product",
            text: "10 calculadoras de 10 reais modelo 240; 8 cadernos 24,90",
        })) as any;
        assert.equal(r.products.length, 2);
        assert.equal(r.products[0].stock, 10);
        assert.equal(r.products[0].price, 1000);
        assert.equal((await products()).length, 0);
    }
    finally {
        globalThis.fetch = original;
        process.env.AI_PROVIDER = "local";
    }
});
test("audio is transcribed before catalog extraction; transcript is available for review", async () => {
    const original = fetch;
    process.env.AI_PROVIDER = "cloudflare";
    let calls = 0;
    globalThis.fetch = (async (url, init) => {
        calls++;
        const body = JSON.parse(init!.body as string);
        if (calls === 1) {
            assert.ok(String(url).endsWith("whisper-large-v3-turbo"));
            assert.equal(body.audio, "AAAA");
            assert.equal(body.language, "pt");
            return Response.json({
                result: { text: "Tenho dez calculadoras de dez reais." },
            });
        }
        assert.ok(body.messages[1].content.includes("dez calculadoras"));
        assert.equal(body.audio, undefined);
        return Response.json({
            result: {
                response: JSON.stringify({
                    products: [
                        {
                            name: "Calculadora",
                            price: 1000,
                            stock: 10,
                            category: "Calculadoras",
                        },
                    ],
                }),
            },
        });
    }) as typeof fetch;
    try {
        const r = (await aiTask({
            task: "extract_product",
            audio: { mimeType: "audio/mpeg", dataBase64: "AAAA" },
        })) as any;
        assert.equal(calls, 2);
        assert.ok(r.transcription.includes("dez calculadoras"));
        assert.equal(r.products[0].price, 1000);
        assert.equal((await products()).length, 0);
    }
    finally {
        globalThis.fetch = original;
        process.env.AI_PROVIDER = "local";
    }
});
test("n8n receives audio and may return multiple drafts plus transcript", async () => {
    const original = fetch;
    process.env.AI_PROVIDER = "n8n";
    let calls = 0;
    globalThis.fetch = (async (_url, init) => {
        calls++;
        const body = JSON.parse(init!.body as string);
        assert.equal(body.input.audio.dataBase64, "AAAA");
        return Response.json({
            products: [
                { name: "Caderno", price: 1200, stock: 2, category: "Cadernos" },
            ],
            transcription: "dois cadernos",
        });
    }) as typeof fetch;
    try {
        const r = (await aiTask({
            task: "extract_product",
            audio: { mimeType: "audio/ogg", dataBase64: "AAAA" },
        })) as any;
        assert.equal(calls, 1);
        assert.equal(r.transcription, "dois cadernos");
    }
    finally {
        globalThis.fetch = original;
        process.env.AI_PROVIDER = "local";
    }
});
test("uncertain extracted data must be reviewed; excessive or mixed media is rejected", async () => {
    const original = fetch;
    process.env.AI_PROVIDER = "cloudflare";
    globalThis.fetch = (async () => Response.json({
        result: {
            response: JSON.stringify({
                products: [{ name: "Caderno", category: "Cadernos" }],
            }),
        },
    })) as typeof fetch;
    try {
        const r = (await aiTask({
            task: "extract_product",
            text: "tenho cadernos",
        })) as any;
        assert.equal(r.products[0].price, 0);
        assert.equal(r.products[0].stock, 0);
        assert.equal(r.products[0].warnings.length, 2);
        (await assert.rejects(async () => (await createProductBatch({ products: [{ ...r.products[0], sku: "TEST" }] }, "missing-price")), /Preço/));
        await assert.rejects(async () => (await aiTask({
            task: "extract_product",
            image: { mimeType: "image/png", dataBase64: "AAAA" },
            audio: { mimeType: "audio/mpeg", dataBase64: "AAAA" },
        })), /não ambos|por extração/);
        await assert.rejects(async () => (await aiTask({
            task: "extract_product",
            audio: { mimeType: "audio/mpeg", dataBase64: "A".repeat(4000004) },
        })), /3 MB/);
    }
    finally {
        globalThis.fetch = original;
        process.env.AI_PROVIDER = "local";
    }
});
test("batch registration is atomic and idempotent, including a duplicate SKU conflict", async () => {
    const existing = (await product()), a = {
        name: "Novo A",
        sku: "NEW-A",
        price: 1000,
        stock: 2,
        category: "Novos",
    }, b = {
        name: "Novo B",
        sku: "NEW-B",
        price: 2500,
        stock: 3,
        category: "Novos",
    };
    (await assert.rejects(async () => (await createProductBatch({ products: [a, { ...b, sku: existing.sku }] }, "batch-conflict")), /UNIQUE/));
    assert.equal((await products()).length, 1);
    assert.ok(!(await products()).some((p) => p.sku === "NEW-A"));
    const first = (await createProductBatch({ products: [a, b] }, "batch-ok")), again = (await createProductBatch({ products: [a, b] }, "batch-ok"));
    assert.equal(first.count, 2);
    assert.equal(again.duplicate, true);
    assert.deepEqual(again.ids, first.ids);
    assert.equal((await products()).length, 3);
    (await assert.rejects(async () => (await createProductBatch({ products: [{ ...a, price: 9999 }, b] }, "batch-ok")), /já usada/));
});
test("provider HTTP status errors expose a useful diagnostic without exposing tokens", async () => {
    const original = fetch;
    process.env.AI_PROVIDER = "cloudflare";
    globalThis.fetch = (async () => Response.json({ errors: [{ message: "SECRET MUST NOT LEAK" }] }, { status: 403 })) as typeof fetch;
    try {
        await assert.rejects(async () => (await aiTask({ task: "extract_product", text: "caderno" })), (e: any) => e.message.includes("HTTP 403") &&
            e.message.includes("permissões") &&
            !e.message.includes("SECRET"));
    }
    finally {
        globalThis.fetch = original;
        process.env.AI_PROVIDER = "local";
    }
});
