"use client";
import { useRef, useState } from "react";
import { Check, Package } from "lucide-react";
import { api, request } from "@/lib/client";
import type { CatalogDraft } from "@/lib/types";
import { Badge, Field, Modal, Spinner } from "./shared";
import type { Notice } from "./ui-types";
type Row = CatalogDraft & {
  key: string;
  sku: string;
  selected: boolean;
  priceText: string;
  stockText: string;
};
export function CatalogReview({
  products,
  transcription,
  onClose,
  refresh,
  notify,
}: {
  products: CatalogDraft[];
  transcription?: string;
  onClose: () => void;
  refresh: () => Promise<void>;
  notify: Notice;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
      products.map((p, i) => ({
        ...p,
        key: crypto.randomUUID(),
        sku: `IA-${Date.now().toString().slice(-6)}-${i + 1}-${crypto.randomUUID().slice(0, 4)}`,
        selected: true,
        priceText: p.price ? String(p.price / 100) : "",
        stockText: String(p.stock),
      })),
    ),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const submissionKey = useRef(crypto.randomUUID()),
    selected = rows.filter((r) => r.selected);
  const change = (key: string, patch: Partial<Row>) => {
    setRows((r) => r.map((x) => (x.key === key ? { ...x, ...patch } : x)));
    submissionKey.current = crypto.randomUUID();
    setError("");
  };
  return (
    <Modal title="Revise seu novo catálogo" onClose={onClose} wide>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const payload = selected.map((r) => ({
              name: r.name,
              sku: r.sku,
              description: r.description,
              price: Math.round(Number(r.priceText.replace(",", ".")) * 100),
              stock: Number(r.stockText),
              category: r.category,
              active: true,
            }));
            const result = await api(
              "products/batch",
              request("POST", { products: payload }, submissionKey.current),
            );
            await refresh();
            notify(`${result.count} produto(s) cadastrado(s) no catálogo.`);
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="review-intro">
          <Package size={24} />
          <div>
            <strong>{products.length} produto(s) identificado(s)</strong>
            <p>
              Confira preço unitário, quantidade e nome. Dados da IA podem
              precisar de correção.
            </p>
          </div>
          <Badge tone="blue">{selected.length} selecionados</Badge>
        </div>
        {transcription && (
          <details className="transcription-review">
            <summary>Ver a transcrição utilizada</summary>
            <p>{transcription}</p>
          </details>
        )}
        <div className="batch-review-list">
          {rows.map((r, index) => (
            <section
              className={`batch-review-item ${r.selected ? "" : "unselected"}`}
              key={r.key}
            >
              <div className="batch-item-heading">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={r.selected}
                    disabled={busy}
                    onChange={(e) =>
                      change(r.key, { selected: e.target.checked })
                    }
                  />
                  Cadastrar produto {index + 1}
                </label>
                <Badge>{r.category}</Badge>
              </div>
              {!!r.warnings?.length && (
                <div className="review-warnings">
                  {r.warnings.map((w, i) => (
                    <p key={i}>{w}</p>
                  ))}
                </div>
              )}
              <Field label={`Nome do produto ${index + 1}`}>
                <input
                  required
                  disabled={!r.selected || busy}
                  maxLength={160}
                  value={r.name}
                  onChange={(e) => change(r.key, { name: e.target.value })}
                />
              </Field>
              <div className="batch-fields">
                <Field label={`Preço unitário ${index + 1} (R$)`}>
                  <input
                    required
                    disabled={!r.selected || busy}
                    type="number"
                    min="0.01"
                    max={1000000}
                    step="0.01"
                    placeholder="Informe o preço"
                    value={r.priceText}
                    onChange={(e) =>
                      change(r.key, { priceText: e.target.value })
                    }
                  />
                </Field>
                <Field label={`Estoque físico ${index + 1}`}>
                  <input
                    required
                    disabled={!r.selected || busy}
                    type="number"
                    min={0}
                    max={1000000}
                    step={1}
                    value={r.stockText}
                    onChange={(e) =>
                      change(r.key, { stockText: e.target.value })
                    }
                  />
                </Field>
                <Field label={`SKU ${index + 1}`}>
                  <input
                    required
                    disabled={!r.selected || busy}
                    maxLength={50}
                    value={r.sku}
                    onChange={(e) => change(r.key, { sku: e.target.value })}
                  />
                </Field>
              </div>
              <Field label={`Categoria ${index + 1}`}>
                <input
                  required
                  disabled={!r.selected || busy}
                  maxLength={70}
                  value={r.category}
                  onChange={(e) => change(r.key, { category: e.target.value })}
                />
              </Field>
              <details className="review-description">
                <summary>Descrição do produto</summary>
                <Field label={`Descrição ${index + 1}`}>
                  <textarea
                    disabled={!r.selected || busy}
                    maxLength={1000}
                    value={r.description}
                    onChange={(e) =>
                      change(r.key, { description: e.target.value })
                    }
                  />
                </Field>
              </details>
            </section>
          ))}
        </div>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="form-footer">
          <button
            type="button"
            className="btn subtle"
            disabled={busy}
            onClick={onClose}
          >
            Descartar rascunhos
          </button>
          <button className="btn primary" disabled={busy || !selected.length}>
            {busy ? (
              <Spinner />
            ) : (
              <>
                <Check size={17} />
                Cadastrar {selected.length} produto(s)
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
