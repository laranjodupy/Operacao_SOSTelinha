"use client";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  Clock3,
  Download,
  ExternalLink,
  Search,
  Store,
} from "lucide-react";
import { api, request } from "@/lib/client";
import { money, statusLabels, type Snapshot } from "@/lib/types";
import { Badge, Empty, Modal } from "./shared";

import { time, date, tone, type Notice } from "./ui-types";
import { OrderTable } from "./order-table";

export function Orders({
  data: d,
  refresh,
  notify,
}: {
  data: Snapshot;
  refresh: () => Promise<void>;
  notify: Notice;
}) {
  const [status, setStatus] = useState("all"),
    [search, setSearch] = useState(""),
    [id, setId] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmCancel, setConfirmCancel] = useState(false);
  const selected = d.orders.find((o) => o.id === id),
    filtered = d.orders.filter(
      (o) =>
        (status === "all" || o.status === status) &&
        `${o.number} ${o.customerName}`
          .toLowerCase()
          .includes(search.toLowerCase()),
    );
  const transition = async (s: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      await api(`orders/${selected.id}`, request("PATCH", { status: s }));
      await refresh();
      notify("Status do pedido atualizado.");
      setConfirmCancel(false);
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };
  const exportCsv = () => {
    const cell = (v: unknown) =>
      `"${String(v)
        .replace(/^[=+@\-\t\r]/, "'$&")
        .replaceAll('"', '""')}"`;
    const content =
      "\ufeff" +
      [
        [
          "Pedido",
          "Cliente",
          "Status",
          "Total BRL",
          "Recebimento",
          "Criado em",
        ],
        ...filtered.map((o) => [
          o.number,
          o.customerName,
          statusLabels[o.status],
          (o.total / 100).toFixed(2).replace(".", ","),
          o.delivery === "pickup" ? "Retirada" : "Entrega",
          o.createdAt,
        ]),
      ]
        .map((r) => r.map(cell).join(";"))
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([content], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "pedidos-tray-balcao.csv";
    a.click();
    URL.revokeObjectURL(url);
    notify("Pedidos exportados.");
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CADA VENDA NO SEU LUGAR</span>
          <h1>Pedidos</h1>
          <p>Da confirmação ao balcão, acompanhe cada etapa.</p>
        </div>
        <button
          className="btn subtle"
          onClick={exportCsv}
          disabled={!filtered.length}
        >
          <Download size={16} />
          Exportar CSV
        </button>
      </div>
      <section className="order-summary-grid">
        {[
          {
            name: "Aguardando pagamento",
            value: d.metrics.pending,
            tone: "amber",
          },
          {
            name: "Para preparar",
            value: d.orders.filter((o) => o.status === "paid").length,
            tone: "blue",
          },
          {
            name: "Em preparação / prontos",
            value: d.orders.filter((o) =>
              ["preparing", "ready"].includes(o.status),
            ).length,
            tone: "violet",
          },
          {
            name: "Concluídos",
            value: d.orders.filter((o) => o.status === "delivered").length,
            tone: "green",
          },
        ].map((x) => (
          <div className="order-stat" key={x.name}>
            <Badge tone={x.tone}>{x.name}</Badge>
            <strong>{String(x.value).padStart(2, "0")}</strong>
          </div>
        ))}
      </section>
      <section className="panel">
        <div className="catalog-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              aria-label="Buscar pedido"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pedido ou cliente…"
            />
          </label>
          <select
            aria-label="Filtrar pedidos por status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option value="all">Todos os status</option>
            {Object.entries(statusLabels).map(([key, label]) => (
              <option value={key} key={key}>
                {label}
              </option>
            ))}
          </select>
          <span>{filtered.length} pedidos</span>
        </div>
        {filtered.length ? (
          <OrderTable
            orders={filtered}
            onSelect={(o) => {
              setId(o.id);
              setConfirmCancel(false);
            }}
          />
        ) : (
          <Empty
            title="Nenhum pedido por aqui"
            description="Confirme os itens de uma conversa para gerar o primeiro link de compra."
          />
        )}
      </section>
      {selected && (
        <Modal title={`Pedido ${selected.number}`} onClose={() => setId("")}>
          <div className="order-detail">
            <div className="order-detail-top">
              <div>
                <h3>{selected.customerName}</h3>
                <small>
                  {date(selected.createdAt)} às {time(selected.createdAt)}{" "}
                  (Brasília)
                </small>
              </div>
              <Badge tone={tone(selected.status)}>
                {statusLabels[selected.status]}
              </Badge>
            </div>
            {selected.items.map((i) => (
              <div className="order-detail-item" key={i.productId}>
                <span>
                  {i.quantity} × {i.name}
                </span>
                <strong>{money(i.quantity * i.unitPrice)}</strong>
              </div>
            ))}
            <div className="order-detail-item">
              <span>Entrega</span>
              <strong>{money(selected.deliveryFee)}</strong>
            </div>
            <div className="grand-total">
              <span>Total</span>
              <strong>{money(selected.total)}</strong>
            </div>
            <div className="delivery-detail">
              <MapPinIcon />
              <div>
                <strong>
                  {selected.delivery === "pickup"
                    ? "Retirada na loja"
                    : "Entrega local"}
                </strong>
                <p>
                  {selected.delivery === "pickup"
                    ? d.settings.address
                    : selected.address || "Endereço ainda não informado"}
                </p>
              </div>
            </div>
            {selected.status === "pending" && (
              <div className="demo-notice">
                <Clock3 size={17} />
                Reserva até {time(selected.expiresAt)}. O estoque é liberado no
                vencimento.
              </div>
            )}
            <a
              className="btn subtle full"
              href={`/checkout/${selected.token}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={16} />
              Abrir checkout do cliente
            </a>
            {selected.status === "paid" && (
              <button
                className="btn primary full"
                disabled={busy}
                onClick={() => transition("preparing")}
              >
                Começar preparação <ArrowRight size={16} />
              </button>
            )}
            {selected.status === "preparing" && (
              <button
                className="btn primary full"
                disabled={busy}
                onClick={() =>
                  transition(
                    selected.delivery === "pickup" ? "ready" : "delivered",
                  )
                }
              >
                {selected.delivery === "pickup"
                  ? "Marcar como pronto"
                  : "Concluir entrega"}
                <Check size={17} />
              </button>
            )}
            {selected.status === "ready" && (
              <button
                className="btn green full"
                disabled={busy}
                onClick={() => transition("delivered")}
              >
                Confirmar retirada <Check size={17} />
              </button>
            )}
            {selected.status === "pending" &&
              (confirmCancel ? (
                <div className="cancel-confirm">
                  <p>Cancelar este link e liberar as unidades reservadas?</p>
                  <button
                    className="btn danger"
                    disabled={busy}
                    onClick={() => transition("cancelled")}
                  >
                    Sim, cancelar pedido
                  </button>
                  <button
                    className="text-btn"
                    onClick={() => setConfirmCancel(false)}
                  >
                    Manter pedido
                  </button>
                </div>
              ) : (
                <button
                  className="text-btn danger-text"
                  onClick={() => setConfirmCancel(true)}
                >
                  Cancelar pedido e liberar estoque
                </button>
              ))}
          </div>
        </Modal>
      )}
    </>
  );
}
function MapPinIcon() {
  return <Store size={21} />;
}
