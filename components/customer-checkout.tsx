"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  CreditCard,
  MapPin,
  ShieldCheck,
  Store,
  Truck,
} from "lucide-react";
import { api, request } from "@/lib/client";
import { money, statusLabels, type Order } from "@/lib/types";
import { Badge, Brand, Field, ProductArt, Spinner } from "./shared";
type CheckoutData = {
  order: Omit<
    Order,
    "id" | "token" | "address" | "conversationId" | "createdAt"
  >;
  store: {
    name: string;
    address: string;
    pickupMinutes: number;
    deliveryFee: number;
    deliveryEnabled: boolean;
  };
  demo: boolean;
};
export function CustomerCheckout({ token }: { token: string }) {
  const [data, setData] = useState<CheckoutData | null>(null),
    [error, setError] = useState(""),
    [delivery, setDelivery] = useState<"pickup" | "local">("pickup"),
    [address, setAddress] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(await api(`checkout/${encodeURIComponent(token)}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);
  useEffect(() => {
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 5000);
    return () => clearInterval(timer);
  }, [load]);
  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(
        `checkout/${encodeURIComponent(token)}/pay`,
        request("POST", { delivery, address }),
      );
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (!data)
    return (
      <main className="checkout-page">
        <div className="checkout-container">
          <Brand />
          {error ? (
            <div className="error-box" role="alert">
              {error}
            </div>
          ) : (
            <Spinner />
          )}
        </div>
      </main>
    );
  const { order: o, store: s } = data,
    paid = ["paid", "preparing", "ready", "delivered"].includes(o.status),
    unavailable = ["cancelled", "expired"].includes(o.status),
    total = o.subtotal + (delivery === "local" ? s.deliveryFee : 0);
  return (
    <main className="checkout-page">
      <div className="checkout-container">
        <header className="checkout-brand">
          <Brand />
          <ShieldCheck size={20} />
        </header>
        <div className="checkout-store">
          <span className="store-circle">
            <Store size={24} />
          </span>
          <div>
            <small>VOCÊ ESTÁ COMPRANDO EM</small>
            <h1>{s.name}</h1>
          </div>
        </div>
        {data.demo && (
          <div className="demo-notice">
            <CreditCard size={17} />
            <span>
              <strong>Compra de demonstração</strong>Não há cobrança, Pix real
              ou movimentação financeira.
            </span>
          </div>
        )}
        {paid ? (
          <section className="checkout-success">
            <span className="success-orb">
              <Check size={38} />
            </span>
            <Badge tone="green">{statusLabels[o.status]}</Badge>
            <h2>Plim! Pedido confirmado.</h2>
            <p>
              Obrigado, {o.customerName.split(" ")[0]}! A loja já recebeu seu
              pedido.
            </p>
            <div className="receipt">
              <span>{o.number}</span>
              <strong>{money(o.total)}</strong>
            </div>
            <div className="fulfillment">
              <MapPin size={20} />
              <div>
                <strong>
                  {o.delivery === "pickup"
                    ? "Retirada na loja"
                    : "Entrega local"}
                </strong>
                <span>
                  {o.delivery === "pickup"
                    ? s.address
                    : "A loja combinará a entrega no endereço informado."}
                </span>
              </div>
            </div>
            <p className="muted">
              {data.demo
                ? "Pagamento simulado para testar o fluxo."
                : "Acompanhe o atendimento pelo WhatsApp."}
            </p>
          </section>
        ) : unavailable ? (
          <section className="checkout-success">
            <Clock3 size={38} />
            <h2>{statusLabels[o.status]}</h2>
            <p>Solicite um novo link à loja. Seu pedido não foi cobrado.</p>
          </section>
        ) : (
          <form onSubmit={pay}>
            <section className="checkout-card">
              <div className="section-heading">
                <h2>Seu pedido</h2>
                <Badge>{o.number}</Badge>
              </div>
              {o.items.map((i) => (
                <div className="checkout-item" key={i.productId}>
                  <ProductArt product={{ name: i.name, category: "" }} />
                  <div>
                    <strong>{i.name}</strong>
                    <small>
                      {i.quantity} × {money(i.unitPrice)}
                    </small>
                  </div>
                  <b>{money(i.unitPrice * i.quantity)}</b>
                </div>
              ))}
              <div className="reservation-note">
                <Clock3 size={14} />
                <span>
                  Reservado até{" "}
                  {new Date(o.expiresAt).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "America/Sao_Paulo",
                  })}{" "}
                  (Brasília)
                </span>
              </div>
            </section>
            <section className="checkout-card">
              <h2>Como você quer receber?</h2>
              <label
                className={`delivery-choice ${delivery === "pickup" ? "chosen" : ""}`}
              >
                <input
                  type="radio"
                  name="delivery"
                  checked={delivery === "pickup"}
                  onChange={() => setDelivery("pickup")}
                />
                <Store size={22} />
                <span>
                  <strong>Retirar no balcão</strong>
                  <small>
                    Previsão: {s.pickupMinutes} minutos após confirmação
                  </small>
                </span>
                <b>Grátis</b>
              </label>
              {s.deliveryEnabled && (
                <label
                  className={`delivery-choice ${delivery === "local" ? "chosen" : ""}`}
                >
                  <input
                    type="radio"
                    name="delivery"
                    checked={delivery === "local"}
                    onChange={() => setDelivery("local")}
                  />
                  <Truck size={22} />
                  <span>
                    <strong>Entrega no bairro</strong>
                    <small>Combine o prazo com a loja</small>
                  </span>
                  <b>{money(s.deliveryFee)}</b>
                </label>
              )}
              {delivery === "local" && (
                <Field
                  label="Endereço completo"
                  hint="A entrega local depende da área atendida pela loja."
                >
                  <textarea
                    required
                    maxLength={400}
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Rua, número, bairro e ponto de referência"
                  />
                </Field>
              )}
            </section>
            <section className="checkout-card">
              <div className="total-row">
                <span>Produtos</span>
                <span>{money(o.subtotal)}</span>
              </div>
              <div className="total-row">
                <span>Entrega</span>
                <span>
                  {delivery === "local" ? money(s.deliveryFee) : "Grátis"}
                </span>
              </div>
              <div className="grand-total">
                <span>Total</span>
                <strong>{money(total)}</strong>
              </div>
              {error && (
                <div className="error-box" role="alert">
                  {error}
                </div>
              )}
              <button className="btn green full" disabled={busy || !data.demo}>
                {busy ? (
                  <Spinner />
                ) : (
                  <>
                    <span className="pix-diamond">◇</span>
                    {data.demo
                      ? "Simular pagamento Pix"
                      : "Pagamento indisponível"}
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
              <p className="checkout-footnote">
                {data.demo
                  ? "Nenhum código Pix real será gerado."
                  : "A loja precisa configurar um gateway de pagamento."}
              </p>
            </section>
          </form>
        )}
        <footer className="checkout-footer">
          <ShieldCheck size={14} /> Link exclusivo do pedido · Projeto
          independente para o desafio Tray
        </footer>
      </div>
    </main>
  );
}
