"use client";
import { useState } from "react";
import { Check, ShieldCheck, Truck } from "lucide-react";
import { api, request } from "@/lib/client";
import { type Settings } from "@/lib/types";
import { Field, Spinner } from "./shared";

import { type Notice } from "./ui-types";

export function StoreSettings({
  settings: s,
  refresh,
  notify,
}: {
  settings: Settings;
  refresh: () => Promise<void>;
  notify: Notice;
}) {
  const [form, setForm] = useState(s),
    [fee, setFee] = useState(String(s.deliveryFee / 100)),
    [busy, setBusy] = useState(false);
  const change = (key: keyof Settings, value: string | number | boolean) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">COM A CARA DA SUA LOJA</span>
          <h1>Minha loja</h1>
          <p>As informações que acompanham cada compra.</p>
        </div>
      </div>
      <form
        className="settings-layout"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              "settings",
              request("PUT", {
                ...form,
                deliveryFee: Math.round(Number(fee) * 100),
              }),
            );
            await refresh();
            notify("Dados da loja atualizados.");
          } catch (e) {
            notify((e as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <section className="panel settings-panel">
          <h2>Informações da loja</h2>
          <Field label="Nome da loja">
            <input
              required
              maxLength={100}
              value={form.name}
              onChange={(e) => change("name", e.target.value)}
            />
          </Field>
          <Field label="Segmento">
            <input
              required
              maxLength={80}
              value={form.segment}
              onChange={(e) => change("segment", e.target.value)}
            />
          </Field>
          <Field label="Endereço para retirada">
            <input
              required
              maxLength={300}
              value={form.address}
              onChange={(e) => change("address", e.target.value)}
            />
          </Field>
          <Field label="Telefone da loja (com DDI e DDD)">
            <input
              type="tel"
              maxLength={24}
              value={form.phone}
              onChange={(e) => change("phone", e.target.value)}
              placeholder="5579999999999"
            />
          </Field>
          <Field
            label="Mensagem de boas-vindas"
            hint="Texto de referência da loja para seu atendimento."
          >
            <textarea
              required
              maxLength={600}
              value={form.welcome}
              onChange={(e) => change("welcome", e.target.value)}
            />
          </Field>
        </section>
        <aside>
          <section className="panel settings-panel">
            <h2>Retirada e entrega</h2>
            <Field label="Previsão de retirada (minutos)">
              <input
                type="number"
                required
                min={1}
                max={1440}
                value={form.pickupMinutes}
                onChange={(e) =>
                  change("pickupMinutes", Number(e.target.value))
                }
              />
            </Field>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.deliveryEnabled}
                onChange={(e) => change("deliveryEnabled", e.target.checked)}
              />
              Oferecer entrega no bairro
            </label>
            <Field label="Taxa de entrega (R$)">
              <input
                type="number"
                required
                min={0}
                max={1000}
                step="0.01"
                value={fee}
                onChange={(e) => setFee(e.target.value)}
              />
            </Field>
            <div className="demo-notice">
              <Truck size={18} />
              <p>
                Combine a área atendida e o prazo com o cliente antes de enviar
                o link.
              </p>
            </div>
            <button className="btn primary full" disabled={busy}>
              {busy ? (
                <Spinner />
              ) : (
                <>
                  <Check size={17} />
                  Salvar alterações
                </>
              )}
            </button>
          </section>
          <div className="settings-help">
            <ShieldCheck size={20} />
            <p>
              As alterações de entrega passam a valer para compras ainda não
              pagas. Valores dos produtos são preservados nos pedidos já
              criados.
            </p>
          </div>
        </aside>
      </form>
    </>
  );
}
