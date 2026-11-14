"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ImagePlus,
  Mic,
  Package,
  Pencil,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { api, request } from "@/lib/client";
import {
  money,
  type Product,
  type Snapshot,
  type CatalogDraft,
} from "@/lib/types";
import { Badge, Empty, Field, Modal, ProductArt, Spinner } from "./shared";

import { type Notice } from "./ui-types";
import { ProductAssistant } from "./catalog-assistant";
import { CatalogReview } from "./catalog-review";

export function Catalog({
  data: d,
  refresh,
  notify,
}: {
  data: Snapshot;
  refresh: () => Promise<void>;
  notify: Notice;
}) {
  const [search, setSearch] = useState(""),
    [category, setCategory] = useState("Todos"),
    [editing, setEditing] = useState<Partial<Product> | null | undefined>(
      undefined,
    ),
    [assistant, setAssistant] = useState(false),
    [drafts, setDrafts] = useState<{
      products: CatalogDraft[];
      transcription?: string;
    } | null>(null);
  const filtered = d.products.filter(
      (p) =>
        (category === "Todos" || p.category === category) &&
        `${p.name} ${p.sku}`.toLowerCase().includes(search.toLowerCase()),
    ),
    categories = ["Todos", ...new Set(d.products.map((p) => p.category))];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">COMECE PELOS SEUS CAMPEÕES DE VENDA</span>
          <h1>Produtos e estoque</h1>
          <p>Catálogo simples. Estoque disponível sempre à vista.</p>
        </div>
        <div className="heading-actions">
          <button className="btn subtle" onClick={() => setAssistant(true)}>
            <Sparkles size={16} />
            Cadastrar com IA
          </button>
          <button className="btn primary" onClick={() => setEditing(null)}>
            <Plus size={17} />
            Novo produto
          </button>
        </div>
      </div>
      <div className="catalog-banner">
        <span>
          <Package size={23} />
        </span>
        <div>
          <strong>O estoque trabalha junto com você.</strong>
          <p>
            Links ativos reservam unidades. A baixa acontece ao confirmar o
            pagamento.
          </p>
        </div>
        <Badge tone="blue">
          {d.products.filter((p) => p.active).length} produtos ativos
        </Badge>
      </div>
      <section className="panel">
        <div className="catalog-toolbar">
          <label className="search-field">
            <Search size={17} />
            <input
              placeholder="Buscar produto ou SKU…"
              aria-label="Buscar produto ou SKU"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <select
            aria-label="Filtrar por categoria"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <span>{filtered.length} produtos</span>
        </div>
        {filtered.length ? (
          <div className="catalog-grid">
            {filtered.map((p) => (
              <article
                className={`product-card ${!p.active ? "inactive" : ""}`}
                key={p.id}
              >
                <div className="product-card-art">
                  <ProductArt product={p} large />
                  <div>
                    {!p.active ? (
                      <Badge>Inativo</Badge>
                    ) : p.available === 0 ? (
                      <Badge tone="amber">Sem estoque</Badge>
                    ) : p.available <= 3 ? (
                      <Badge tone="amber">Estoque baixo</Badge>
                    ) : (
                      <Badge tone="green">Disponível</Badge>
                    )}
                  </div>
                  <button
                    className="icon-btn"
                    aria-label={`Editar ${p.name}`}
                    onClick={() => setEditing(p)}
                  >
                    <Pencil size={16} />
                  </button>
                </div>
                <span className="product-category">
                  {p.category} · {p.sku}
                </span>
                <h2>{p.name}</h2>
                <p>{p.description || "Sem descrição adicional."}</p>
                <strong className="product-price">{money(p.price)}</strong>
                <div className="product-inventory">
                  <span>
                    <Package size={13} />
                    {p.available} disponíveis
                  </span>
                  <small>
                    {p.reserved} reservados / {p.stock} físicos
                  </small>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <Empty
            title={
              search
                ? "Nenhum produto encontrado"
                : "Seu catálogo começa com um produto"
            }
            description={
              search
                ? "Tente outro nome ou categoria."
                : "Cadastre os itens mais vendidos da sua loja. Você pode começar com apenas cinco."
            }
          >
            <button className="btn primary" onClick={() => setEditing(null)}>
              <Plus size={16} />
              Cadastrar produto
            </button>
          </Empty>
        )}
      </section>
      {editing !== undefined && (
        <ProductForm
          product={editing}
          onClose={() => setEditing(undefined)}
          refresh={refresh}
          notify={notify}
        />
      )}{" "}
      {assistant && (
        <ProductAssistant
          data={d}
          onClose={() => setAssistant(false)}
          onDrafts={(products, transcription) => {
            setAssistant(false);
            setDrafts({ products, transcription });
          }}
          notify={notify}
        />
      )}
      {drafts && (
        <CatalogReview
          products={drafts.products}
          transcription={drafts.transcription}
          onClose={() => setDrafts(null)}
          refresh={refresh}
          notify={notify}
        />
      )}
    </>
  );
}
function ProductForm({
  product: p,
  onClose,
  refresh,
  notify,
}: {
  product: Partial<Product> | null;
  onClose: () => void;
  refresh: () => Promise<void>;
  notify: Notice;
}) {
  const [name, setName] = useState(p?.name || ""),
    [sku, setSku] = useState(p?.sku || ""),
    [description, setDescription] = useState(p?.description || ""),
    [price, setPrice] = useState(p?.price ? String(p.price / 100) : ""),
    [stock, setStock] = useState(String(p?.stock ?? 0)),
    [category, setCategory] = useState(p?.category || "Geral"),
    [active, setActive] = useState(p?.active ?? true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title={p?.id ? "Editar produto" : "Novo produto"} onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await api(
              p?.id ? `products/${p.id}` : "products",
              request(p?.id ? "PATCH" : "POST", {
                name,
                sku,
                description,
                price: Math.round(Number(price.replace(",", ".")) * 100),
                stock: Number(stock),
                category,
                active,
              }),
            );
            await refresh();
            notify("Produto salvo no catálogo.");
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label="Nome do produto">
          <input
            autoFocus
            required
            maxLength={160}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Caderno 10 matérias"
          />
        </Field>
        <div className="form-row">
          <Field label="SKU / Código">
            <input
              required
              maxLength={50}
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              placeholder="CAD-010"
            />
          </Field>
          <Field label="Categoria">
            <input
              required
              maxLength={70}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            />
          </Field>
        </div>
        <div className="form-row">
          <Field label="Preço (R$)">
            <input
              type="number"
              required
              min="0.01"
              max="1000000"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              placeholder="24,90"
            />
          </Field>
          <Field
            label="Estoque físico"
            hint={
              p?.reserved
                ? `${p.reserved} unidades estão reservadas.`
                : undefined
            }
          >
            <input
              type="number"
              required
              min={p?.reserved || 0}
              max={1000000}
              step={1}
              value={stock}
              onChange={(e) => setStock(e.target.value)}
            />
          </Field>
        </div>
        <Field label="Descrição">
          <textarea
            maxLength={1000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Detalhes que ajudam o cliente a escolher"
          />
        </Field>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Disponível para novos pedidos
        </label>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <div className="form-footer">
          <button type="button" className="btn subtle" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? (
              <Spinner />
            ) : (
              <>
                <Check size={17} />
                Salvar produto
              </>
            )}
          </button>
        </div>
      </form>
    </Modal>
  );
}
