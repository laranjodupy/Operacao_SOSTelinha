"use client";

import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  Clock3,
  ImagePlus,
  MessageCircle,
  Package,
  Plus,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Store,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react";

import { money, type Snapshot } from "@/lib/types";
import { Badge, CheckLine, Empty, Spinner } from "./shared";

import { time, tone, type Tab } from "./ui-types";
import { OrderTable } from "./order-table";

export function Overview({
  data: d,
  go,
  seed,
  busy,
}: {
  data: Snapshot;
  go: (t: Tab) => void;
  seed: () => void;
  busy: boolean;
}) {
  const open = d.conversations.filter((c) => c.status === "open"),
    paid = d.orders.filter((o) => !!o.paidAt),
    hasProducts = d.products.length > 0,
    firstSale = paid.length > 0;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">SEU NEGÓCIO EM MOVIMENTO</span>
          <h1>
            Bom ter você no balcão <span className="wave">✦</span>
          </h1>
          <p>Menos idas e vindas. Mais tempo para atender e vender.</p>
        </div>
        <span className="today-label">
          <Clock3 size={15} />
          {new Intl.DateTimeFormat("pt-BR", {
            day: "numeric",
            month: "long",
            timeZone: "America/Sao_Paulo",
          }).format(new Date())}
        </span>
      </div>
      <section className="hero-card">
        <div className="hero-copy">
          <span className="hero-eyebrow">
            <span /> SUA PRIMEIRA VENDA COMEÇA AQUI
          </span>
          <h2>
            Seu balcão não para.
            <br />
            <span>Sua loja cresce.</span>
          </h2>
          <p>
            Confirme o produto, envie o link e acompanhe a venda.
            <br className="desktop" /> Tudo no ritmo da sua loja.
          </p>
          <button
            className="btn white"
            onClick={() => go(hasProducts ? "inbox" : "catalog")}
          >
            {hasProducts
              ? "Ir para os atendimentos"
              : "Cadastrar primeiro produto"}
            <ArrowRight size={17} />
          </button>
          <small>
            <ShieldCheck size={13} /> Você aprova cada venda. O estoque
            acompanha.
          </small>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="hero-orbit" />
          <span className="hero-floating top">
            <MessageCircle size={16} /> Uma conversa…
          </span>
          <div className="hero-ticket">
            <div className="ticket-top">
              <span className="ticket-shop">
                <Store size={21} />
              </span>
              <div>
                <strong>{d.settings.name}</strong>
                <small>O seu próximo passo no digital</small>
              </div>
              <span className="ticket-dot" />
            </div>
            <div className="ticket-product">
              <span>
                <ShoppingBag size={38} strokeWidth={1.3} />
              </span>
              <div>
                <strong>Do balcão ao cliente</strong>
                <small>Sem interromper o atendimento</small>
                <b>Pronto para começar.</b>
              </div>
            </div>
            <div className="ticket-bottom">
              <CheckCheck size={16} />
              <span>Conversa → Link → Venda</span>
              <Sparkles size={17} />
            </div>
          </div>
          <span className="hero-floating bottom">
            <span>
              <Check size={15} />
            </span>
            …uma nova conquista.
          </span>
          <span className="star-decor">✧</span>
        </div>
      </section>
      <section className="metrics-grid" aria-label="Indicadores da loja">
        <Metric
          label="Vendas digitais hoje"
          value={money(d.metrics.revenue)}
          detail={`${d.metrics.paid} pedidos confirmados${d.integrations.demo ? " · simulação" : ""}`}
          icon={Wallet}
          color="green"
        />
        <Metric
          label="Aguardando pagamento"
          value={String(d.metrics.pending).padStart(2, "0")}
          detail="Links com estoque reservado"
          icon={ShoppingCart}
          color="blue"
        />
        <Metric
          label="Conversas para atender"
          value={String(open.length).padStart(2, "0")}
          detail={`${open.filter((c) => c.unread > 0).length} com novas mensagens`}
          icon={MessageCircle}
          color="violet"
        />
        <Metric
          label="Atenção ao estoque"
          value={String(d.metrics.lowStock).padStart(2, "0")}
          detail="Produtos com até 3 un. disponíveis"
          icon={Package}
          color="orange"
        />
      </section>
      <div className="overview-columns">
        <div className="overview-primary">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">
                  CADA CONVERSA É UMA OPORTUNIDADE
                </span>
                <h2>
                  Seu próximo pedido pode estar aqui{" "}
                  <span className="count-pill">{open.length}</span>
                </h2>
              </div>
              <button className="text-btn" onClick={() => go("inbox")}>
                Ver todos <ArrowRight size={15} />
              </button>
            </div>
            {open.length ? (
              <div className="conversation-previews">
                {open.slice(0, 3).map((c, i) => (
                  <button
                    key={c.id}
                    onClick={() => go("inbox")}
                    className="conversation-preview"
                  >
                    <span className={`avatar color-${i % 3}`}>
                      {c.name
                        .split(" ")
                        .slice(0, 2)
                        .map((x) => x[0])
                        .join("")}
                    </span>
                    <div>
                      <strong>
                        {c.name}
                        {c.source === "demo" && <Badge>Exemplo</Badge>}
                      </strong>
                      <p>
                        {
                          c.messages.filter((m) => m.direction === "in").at(-1)
                            ?.text
                        }
                      </p>
                      <small>
                        <MessageCircle size={11} /> {time(c.updatedAt)} ·{" "}
                        {c.unread ? "Aguardando resposta" : "Em atendimento"}
                      </small>
                    </div>
                    <span className="preview-action">
                      <ArrowUpRight size={18} />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <Empty
                title="Pronto para a primeira conversa"
                description="Receba mensagens pelo webhook ou carregue exemplos para testar o fluxo."
              />
            )}
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <span className="eyebrow">DO LINK À CONFIRMAÇÃO</span>
                <h2>Últimos pedidos</h2>
              </div>
              <button className="text-btn" onClick={() => go("orders")}>
                Ver pedidos <ArrowRight size={15} />
              </button>
            </div>
            {d.orders.length ? (
              <OrderTable
                orders={d.orders.slice(0, 4)}
                onSelect={() => go("orders")}
              />
            ) : (
              <div className="mini-empty">
                <ShoppingBag size={27} />
                <div>
                  <strong>A primeira venda tem um lugar reservado aqui.</strong>
                  <p>Gere um link em Atendimentos e acompanhe o pedido.</p>
                </div>
              </div>
            )}
          </section>
        </div>
        <aside className="overview-aside">
          <section className="journey-card">
            <span className="journey-icon">
              <Trophy size={22} />
            </span>
            <span className="eyebrow">UM PASSO DE CADA VEZ</span>
            <h2>
              Pequenas ações.
              <br />
              Grandes conquistas.
            </h2>
            <p>Começar no digital pode ser mais simples do que parece.</p>
            <div className="journey-progress">
              <span
                style={{
                  width: `${([hasProducts, d.orders.length > 0, firstSale].filter(Boolean).length / 3) * 100}%`,
                }}
              />
            </div>
            <small>
              {
                [hasProducts, d.orders.length > 0, firstSale].filter(Boolean)
                  .length
              }{" "}
              de 3 primeiros passos
            </small>
            <CheckLine done={hasProducts}>Seu catálogo pronto</CheckLine>
            <CheckLine done={d.orders.length > 0}>
              Primeiro link de compra
            </CheckLine>
            <CheckLine done={firstSale}>
              Primeira venda confirmada{d.integrations.demo ? " (demo)" : ""}
            </CheckLine>
            <button
              className="text-btn"
              onClick={() => go(hasProducts ? "inbox" : "catalog")}
            >
              {firstSale ? "Continuar vendendo" : "Dar meu próximo passo"}
              <ArrowRight size={15} />
            </button>
          </section>
          <section className="quick-card">
            <span className="quick-icon">
              <ImagePlus size={22} />
            </span>
            <div>
              <Badge tone="violet">CADASTRO ASSISTIDO</Badge>
              <h3>Mostre. Revise. Venda.</h3>
              <p>
                Transforme uma descrição ou foto em produto, com IA configurada.
              </p>
              <button className="text-btn" onClick={() => go("catalog")}>
                Criar produto <ArrowRight size={15} />
              </button>
            </div>
          </section>
          {d.integrations.demo && (
            <section className="demo-card">
              <div>
                <Zap size={17} />
                <strong>Quer experimentar?</strong>
              </div>
              <p>
                Carregue uma papelaria fictícia com produtos e conversas. Seus
                dados continuam aqui.
              </p>
              <button
                className="btn subtle full"
                disabled={busy}
                onClick={seed}
              >
                {busy ? (
                  <Spinner />
                ) : (
                  <>
                    <Plus size={15} />
                    Carregar exemplos
                  </>
                )}
              </button>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
function Metric({
  label,
  value,
  detail,
  icon: Icon,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Store;
  color: string;
}) {
  return (
    <article className="metric">
      <div>
        <span>{label}</span>
        <span className={`metric-icon ${color}`}>
          <Icon size={19} />
        </span>
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}
