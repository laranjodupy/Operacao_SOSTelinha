"use client";
import { useEffect, useRef, useState } from "react";
import {
  CheckCheck,
  Copy,
  ExternalLink,
  Eye,
  MessageCircle,
  Package,
  Plus,
  RefreshCw,
  Search,
  Send,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { api, request } from "@/lib/client";
import { money, type Order, type Snapshot } from "@/lib/types";
import { Empty, Field, Modal, ProductArt, Spinner } from "./shared";

import { time, type Notice } from "./ui-types";

export function Inbox({
  data: d,
  refresh,
  notify,
}: {
  data: Snapshot;
  refresh: () => Promise<void>;
  notify: Notice;
}) {
  const [active, setActive] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("open"),
    [draft, setDraft] = useState(""),
    [basket, setBasket] = useState<{ productId: string; quantity: number }[]>(
      [],
    ),
    [productId, setProductId] = useState(""),
    [busy, setBusy] = useState(""),
    [generated, setGenerated] = useState<Order | null>(null),
    [preview, setPreview] = useState(false),
    [newConversation, setNewConversation] = useState(false);
  const retryKeys = useRef<Record<string, string>>({});
  const filtered = d.conversations.filter(
      (c) =>
        (filter === "all" || c.status === "open") &&
        `${c.name} ${c.phone}`.toLowerCase().includes(search.toLowerCase()),
    ),
    c = d.conversations.find((x) => x.id === active) || filtered[0];
  useEffect(() => {
    if (!active && c) setActive(c.id);
  }, [active, c]);
  const lastIn =
    c?.messages.filter((m) => m.direction === "in").at(-1)?.text || "";
  const choose = (id: string) => {
    setActive(id);
    setBasket([]);
    setGenerated(null);
    setDraft("");
    setPreview(false);
  };
  const keyFor = (payload: unknown) => {
    const s = JSON.stringify(payload);
    return (retryKeys.current[s] ||= crypto.randomUUID());
  };
  const send = async (content: string, key?: string) => {
    if (!c) return;
    const r = await api(
      `conversations/${c.id}/messages`,
      request(
        "POST",
        { text: content },
        key || keyFor({ id: c.id, text: content }),
      ),
    );
    if (r.status === "failed")
      notify(
        "O provedor recusou o envio. Confira a conversa e a configuração antes de tentar um novo envio.",
        true,
      );
    else if (r.status === "uncertain")
      notify(
        "Envio sem confirmação. Confira o WhatsApp antes de reenviar para evitar duplicidade.",
        true,
      );
    else
      notify(
        r.status === "simulated"
          ? "Mensagem simulada registrada no histórico."
          : "Mensagem aceita pelo provedor. A entrega ainda não foi confirmada.",
      );
    return r;
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !c) return;
    setBusy("message");
    try {
      const content = draft;
      const result = await send(content);
      if (["simulated", "accepted"].includes(result?.status)) {
        delete retryKeys.current[JSON.stringify({ id: c.id, text: content })];
        setDraft("");
      }
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  };
  const suggest = async () => {
    setBusy("ai");
    try {
      const r = await api(
        "ai",
        request("POST", { task: "suggest", text: lastIn }),
      );
      const merged = new Map<string, number>();
      for (const item of r.items)
        merged.set(
          item.productId,
          (merged.get(item.productId) || 0) + item.quantity,
        );
      setBasket(
        [...merged].map(([productId, quantity]) => ({ productId, quantity })),
      );
      setGenerated(null);
      notify(r.notice || "Sugestão pronta. Revise produtos e quantidades.");
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  };
  const total = basket.reduce(
    (a, i) =>
      a +
      (d.products.find((p) => p.id === i.productId)?.price || 0) * i.quantity,
    0,
  );
  const approve = async () => {
    if (!c || !basket.length) return;
    setBusy("approve");
    try {
      const payload = {
        customerName: c.name,
        conversationId: c.id,
        items: basket,
      };
      const o = await api<Order>(
        "orders",
        request("POST", payload, keyFor(payload)),
      );
      setGenerated(o);
      const url = `${window.location.origin}/checkout/${o.token}`;
      await send(
        `Olá, ${c.name.split(" ")[0]}! Confira seu pedido e finalize pelo link: ${url}\nOs produtos ficam reservados por 30 minutos.${d.integrations.demo ? " Este é um teste, sem cobrança real." : ""}`,
        `checkout-${o.id}`,
      );
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
      await refresh();
    } finally {
      setBusy("");
    }
  };
  const toggle = async () => {
    if (!c) return;
    setBusy("close");
    try {
      await api(
        `conversations/${c.id}`,
        request("PATCH", { status: c.status === "open" ? "closed" : "open" }),
      );
      await refresh();
      notify(
        c.status === "open"
          ? "Atendimento concluído."
          : "Atendimento reaberto.",
      );
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy("");
    }
  };
  const available = d.products.filter(
    (p) =>
      p.active && p.available > 0 && !basket.some((i) => i.productId === p.id),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">UMA CONVERSA. UM NOVO PEDIDO.</span>
          <h1>Seu balcão digital</h1>
          <p>
            Confira os itens e transforme o interesse do cliente em um link de
            compra.
          </p>
        </div>
        {d.integrations.demo && (
          <button
            className="btn subtle"
            onClick={() => setNewConversation(true)}
          >
            <Plus size={16} />
            Simular mensagem
          </button>
        )}
      </div>
      <section className="inbox-grid">
        <aside className="conversation-list">
          <div className="list-head">
            <h2>
              Atendimentos <span>{filtered.length}</span>
            </h2>
            <label className="search-field">
              <Search size={16} />
              <input
                aria-label="Buscar conversa"
                placeholder="Buscar cliente…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="segmented">
              <button
                className={filter === "open" ? "selected" : ""}
                onClick={() => setFilter("open")}
              >
                Em aberto
              </button>
              <button
                className={filter === "all" ? "selected" : ""}
                onClick={() => setFilter("all")}
              >
                Todos
              </button>
            </div>
          </div>
          {filtered.length ? (
            filtered.map((x, i) => (
              <button
                className={`conversation-row ${c?.id === x.id ? "selected" : ""}`}
                key={x.id}
                onClick={() => choose(x.id)}
              >
                <span className={`avatar color-${i % 3}`}>{x.name[0]}</span>
                <div>
                  <strong>
                    {x.name}
                    <time>{time(x.updatedAt)}</time>
                  </strong>
                  <p>{x.messages.at(-1)?.text}</p>
                  <small>
                    {x.source === "demo"
                      ? "Exemplo de demonstração"
                      : x.status === "closed"
                        ? "Concluído"
                        : "WhatsApp"}
                    {x.unread > 0 && <b>{x.unread}</b>}
                  </small>
                </div>
              </button>
            ))
          ) : (
            <div className="list-empty">Nenhuma conversa por aqui.</div>
          )}
        </aside>
        {c ? (
          <>
            <section className="conversation-detail">
              <header className="conversation-heading">
                <span className="avatar color-0">{c.name[0]}</span>
                <div>
                  <h2>{c.name}</h2>
                  <small>
                    +{c.phone} ·{" "}
                    {c.source === "demo"
                      ? "conversa fictícia"
                      : "conversa recebida"}
                  </small>
                </div>
                <button
                  className="icon-btn"
                  disabled={!!busy}
                  onClick={toggle}
                  title={
                    c.status === "open"
                      ? "Concluir atendimento"
                      : "Reabrir atendimento"
                  }
                  aria-label={
                    c.status === "open"
                      ? "Concluir atendimento"
                      : "Reabrir atendimento"
                  }
                >
                  {c.status === "open" ? (
                    <CheckCheck size={18} />
                  ) : (
                    <RefreshCw size={18} />
                  )}
                </button>
              </header>
              <div className="chat-history" aria-label="Histórico da conversa">
                <div className="chat-privacy">
                  <ShieldCheck size={12} />
                  Você aprova as respostas e os pedidos.
                </div>
                {c.messages.map((m) => (
                  <div
                    className={`message ${m.direction === "in" ? "incoming" : "outgoing"}`}
                    key={m.id}
                  >
                    <p>{m.text}</p>
                    <small>
                      {time(m.createdAt)}
                      {m.direction === "out" && (
                        <>
                          {m.status === "simulated"
                            ? " · Simulada"
                            : m.status === "accepted"
                              ? " · Aceita pelo provedor"
                              : m.status === "sending"
                                ? " · Enviando"
                                : m.status === "uncertain"
                                  ? " · Sem confirmação"
                                  : " · Falhou"}
                        </>
                      )}
                    </small>
                  </div>
                ))}
              </div>
              <form className="message-composer" onSubmit={submit}>
                <textarea
                  aria-label="Resposta ao cliente"
                  value={draft}
                  maxLength={4000}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escreva sua resposta…"
                  rows={2}
                />
                <button
                  className="btn primary"
                  aria-label="Enviar resposta"
                  disabled={!!busy || !draft.trim()}
                >
                  {busy === "message" ? <Spinner /> : <Send size={18} />}
                </button>
              </form>
            </section>
            <aside className="order-builder">
              <div className="builder-title">
                <span>
                  <ShoppingBag size={19} />
                </span>
                <div>
                  <small>VOCÊ CONFIRMA. O CLIENTE COMPRA.</small>
                  <h2>Monte o pedido</h2>
                </div>
              </div>
              <button
                className="btn ai full"
                onClick={suggest}
                disabled={!!busy || !lastIn}
              >
                {busy === "ai" ? <Spinner /> : <Sparkles size={16} />}Sugerir
                itens da conversa
              </button>
              <p className="microcopy">
                {d.integrations.ai === "local"
                  ? "Sugestão local por palavras-chave. Revise as quantidades."
                  : "A IA sugere. Você revisa os produtos e quantidades."}
              </p>
              <div className="basket-items">
                {basket.length ? (
                  basket.map((i) => {
                    const p = d.products.find((p) => p.id === i.productId);
                    return (
                      p && (
                        <div className="basket-item" key={p.id}>
                          <ProductArt product={p} />
                          <div>
                            <strong>{p.name}</strong>
                            <small>
                              {money(p.price)} · {p.available} disponíveis
                            </small>
                            <div className="quantity-row">
                              <label>
                                Qtd.
                                <input
                                  aria-label={`Quantidade de ${p.name}`}
                                  type="number"
                                  min={1}
                                  max={999}
                                  value={i.quantity}
                                  onChange={(e) => {
                                    setBasket((b) =>
                                      b.map((x) =>
                                        x.productId === p.id
                                          ? {
                                              ...x,
                                              quantity: Number(e.target.value),
                                            }
                                          : x,
                                      ),
                                    );
                                    setGenerated(null);
                                  }}
                                  disabled={!!generated}
                                />
                              </label>
                              <b>{money(i.quantity * p.price)}</b>
                            </div>
                          </div>
                          <button
                            className="icon-btn"
                            aria-label={`Remover ${p.name}`}
                            disabled={!!generated}
                            onClick={() =>
                              setBasket((b) =>
                                b.filter((x) => x.productId !== p.id),
                              )
                            }
                          >
                            <X size={14} />
                          </button>
                        </div>
                      )
                    );
                  })
                ) : (
                  <div className="basket-empty">
                    <Package size={27} />
                    <p>
                      Adicione os produtos que
                      <br />o cliente quer comprar.
                    </p>
                  </div>
                )}
              </div>
              {!generated && (
                <div className="add-product">
                  <select
                    aria-label="Adicionar produto ao pedido"
                    value={productId}
                    onChange={(e) => setProductId(e.target.value)}
                  >
                    <option value="">Selecionar produto…</option>
                    {available.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name} · {money(p.price)}
                      </option>
                    ))}
                  </select>
                  <button
                    className="icon-btn"
                    disabled={!productId}
                    aria-label="Adicionar produto selecionado"
                    onClick={() => {
                      setBasket((b) => [...b, { productId, quantity: 1 }]);
                      setProductId("");
                    }}
                  >
                    <Plus size={18} />
                  </button>
                </div>
              )}
              <div className="builder-summary">
                <span>Subtotal</span>
                <strong>{money(total)}</strong>
              </div>
              <div className="delivery-hint">
                <Store size={16} />
                <span>
                  Retirada grátis
                  {d.settings.deliveryEnabled
                    ? ` ou entrega por ${money(d.settings.deliveryFee)}`
                    : ""}
                  .<small>O cliente escolhe no checkout.</small>
                </span>
              </div>
              {generated ? (
                <div className="generated-box">
                  <span>
                    <CheckCheck size={17} />
                    Link de compra criado
                  </span>
                  <p>
                    Pedido {generated.number}. Consulte o status de envio na
                    conversa.
                  </p>
                  <button
                    className="btn primary full"
                    onClick={() => setPreview(true)}
                  >
                    <Eye size={16} />
                    Ver compra do cliente
                  </button>
                  <button
                    className="text-btn"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(
                          `${location.origin}/checkout/${generated.token}`,
                        );
                        notify("Link copiado.");
                      } catch {
                        notify(
                          "Não foi possível copiar. Abra o checkout para obter o endereço.",
                          true,
                        );
                      }
                    }}
                  >
                    <Copy size={14} />
                    Copiar link
                  </button>
                  <button
                    className="text-btn"
                    onClick={() => {
                      setGenerated(null);
                      setBasket([]);
                      retryKeys.current = {};
                    }}
                  >
                    Montar outro pedido
                  </button>
                </div>
              ) : (
                <button
                  className="btn primary full"
                  disabled={
                    !!busy ||
                    !basket.length ||
                    basket.some(
                      (x) => !Number.isInteger(x.quantity) || x.quantity < 1,
                    )
                  }
                  onClick={approve}
                >
                  {busy === "approve" ? (
                    <Spinner />
                  ) : (
                    <>
                      <Send size={16} />
                      Confirmar e enviar link
                    </>
                  )}
                </button>
              )}
              <div className="builder-security">
                <ShieldCheck size={13} />
                Estoque reservado por 30 minutos.
              </div>
            </aside>
          </>
        ) : (
          <div className="inbox-empty">
            <Empty
              title="O próximo atendimento começa aqui"
              description="Carregue os exemplos na Visão geral ou receba uma mensagem pelo webhook."
            />
          </div>
        )}
      </section>
      {preview && generated && (
        <Modal
          title={`Compra do cliente · ${generated.number}`}
          onClose={() => setPreview(false)}
        >
          <iframe
            className="checkout-preview"
            src={`/checkout/${generated.token}`}
            title="Checkout do cliente"
          />
          <a
            className="btn subtle full"
            href={`/checkout/${generated.token}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir em outra aba <ExternalLink size={15} />
          </a>
        </Modal>
      )}
      {newConversation && (
        <SimulateMessage
          onClose={() => setNewConversation(false)}
          refresh={refresh}
          notify={notify}
        />
      )}
    </>
  );
}
function SimulateMessage({
  onClose,
  refresh,
  notify,
}: {
  onClose: () => void;
  refresh: () => Promise<void>;
  notify: Notice;
}) {
  const [name, setName] = useState(""),
    [phone, setPhone] = useState(""),
    [text, setText] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Simular uma mensagem recebida" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              "demo/message",
              request("POST", {
                name,
                phone,
                text,
                externalId: crypto.randomUUID(),
              }),
            );
            await refresh();
            notify("Mensagem fictícia recebida.");
            onClose();
          } catch (e) {
            notify((e as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">
          Esse teste cria uma conversa local. Nenhuma mensagem será enviada ao
          telefone informado.
        </p>
        <Field label="Nome do cliente">
          <input
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Ana Silva"
          />
        </Field>
        <Field label="Telefone com DDI e DDD">
          <input
            type="tel"
            required
            maxLength={24}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="5579999990003"
          />
        </Field>
        <Field label="Mensagem">
          <textarea
            required
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Oi! Vocês têm caderno para retirar hoje?"
          />
        </Field>
        <button className="btn primary" disabled={busy}>
          {busy ? (
            <Spinner />
          ) : (
            <>
              <MessageCircle size={17} />
              Receber mensagem de teste
            </>
          )}
        </button>
      </form>
    </Modal>
  );
}
