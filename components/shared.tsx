"use client";
import { useEffect, useRef } from "react";
import {
  BookOpen,
  BriefcaseBusiness,
  Calculator,
  Check,
  Package,
  Pencil,
  Store,
  X,
} from "lucide-react";
import type { Product } from "@/lib/types";
export function ProductArt({
  product,
  large = false,
}: {
  product: Pick<Product, "name" | "category">;
  large?: boolean;
}) {
  const name = product.name.toLowerCase(),
    Icon = name.includes("mochila")
      ? BriefcaseBusiness
      : name.includes("caderno")
        ? BookOpen
        : name.includes("calculadora")
          ? Calculator
          : name.includes("caneta") || name.includes("lápis")
            ? Pencil
            : Package;
  return (
    <span
      className={`product-art ${large ? "large" : ""}`}
      data-kind={
        name.includes("mochila")
          ? "bag"
          : name.includes("caderno")
            ? "book"
            : name.includes("caneta")
              ? "pen"
              : "other"
      }
    >
      <Icon size={large ? 36 : 23} strokeWidth={1.6} />
    </span>
  );
}
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <div className={`brand ${light ? "light" : ""}`}>
      <span className="brand-icon">
        <Store size={23} />
      </span>
      <span>
        <strong>
          tray<span>.</span>balcão
        </strong>
        <small>Sua loja, um passo à frente.</small>
      </span>
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Empty({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <span>
        <Package size={30} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {children}
    </div>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button
          className="icon-btn"
          onClick={onClose}
          aria-label="Fechar janela"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Spinner() {
  return <span className="spinner" aria-label="Carregando" />;
}
export function CheckLine({
  done,
  children,
}: {
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`checkline ${done ? "done" : ""}`}>
      <span>{done ? <Check size={13} /> : <span />}</span>
      {children}
    </div>
  );
}
