"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bell,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageCircle,
  Package,
  Plug,
  RefreshCw,
  Settings2,
  ShoppingBag,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { api, request } from "@/lib/client";
import { type Snapshot } from "@/lib/types";
import { Brand, Spinner } from "./shared";

import { type Tab, type Notice } from "./ui-types";
import { Login } from "./login";
import { Overview } from "./overview";
import { Inbox } from "./inbox";
import { Catalog } from "./catalog";
import { Orders } from "./orders";
import { Integrations } from "./integrations";
import { StoreSettings } from "./store-settings";
const navs: { id: Tab; label: string; icon: typeof Store }[] = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "inbox", label: "Atendimentos", icon: MessageCircle },
  { id: "catalog", label: "Produtos e estoque", icon: Package },
  { id: "orders", label: "Pedidos", icon: ShoppingBag },
  { id: "integrations", label: "Integrações", icon: Plug },
  { id: "settings", label: "Minha loja", icon: Settings2 },
];
export function Workspace() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [data, setData] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [tab, setTab] = useState<Tab>("overview"),
    [mobile, setMobile] = useState(false),
    [toast, setToast] = useState<{ message: string; error: boolean } | null>(
      null,
    ),
    [loading, setLoading] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback<Notice>((message, error = false) => {
    setToast({ message, error });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6500);
  }, []);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      if (res.status === 401) {
        setAuth(false);
        setData(null);
        return;
      }
      const d = await res.json();
      if (!res.ok) throw new Error(d.error);
      setData(d);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => {
    api<{ authenticated: boolean }>("session")
      .then((d) => {
        setAuth(d.authenticated);
        if (d.authenticated) void refresh();
      })
      .catch((e) => {
        setAuth(false);
        setError(e.message);
      });
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [refresh]);
  useEffect(() => {
    if (!auth) return;
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [auth, refresh]);
  const reload = async () => {
    setLoading(true);
    await refresh();
    setLoading(false);
  };
  const seed = async () => {
    setLoading(true);
    try {
      const r = await api("demo/seed", request("POST"));
      notify(
        r.seeded
          ? "Catálogo e conversas de exemplo adicionados."
          : "Os exemplos já foram adicionados. Seus dados foram preservados.",
      );
      await refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  };
  const go = (t: Tab) => {
    setTab(t);
    setMobile(false);
  };
  if (auth === null)
    return (
      <div className="app-loading">
        <Brand />
        <Spinner />
        <p>Abrindo seu balcão…</p>
      </div>
    );
  if (!auth)
    return (
      <Login
        error={error}
        onLogin={() => {
          setAuth(true);
          void refresh();
        }}
      />
    );
  if (!data)
    return (
      <div className="app-loading">
        <Brand />
        {error ? (
          <>
            <div className="error-box">{error}</div>
            <button className="btn primary" onClick={reload}>
              Tentar novamente
            </button>
          </>
        ) : (
          <Spinner />
        )}
      </div>
    );
  const unread = data.conversations.filter(
    (c) => c.unread > 0 && c.status === "open",
  ).length;
  return (
    <div className="app-shell">
      <button
        className={`sidebar-scrim ${mobile ? "shown" : ""}`}
        aria-label="Fechar menu"
        onClick={() => setMobile(false)}
      />
      <aside className={`sidebar ${mobile ? "shown" : ""}`}>
        <Brand light />
        <div className="store-selector">
          <span className="shop-square">
            <Store size={19} />
          </span>
          <div>
            <strong>{data.settings.name}</strong>
            <small>{data.settings.segment}</small>
          </div>
          <button aria-label="Configurar loja" onClick={() => go("settings")}>
            <ChevronDown size={16} />
          </button>
        </div>
        <span className="nav-caption">SEU DIA A DIA</span>
        <nav aria-label="Menu principal">
          {navs.map(({ id, label, icon: Icon }, i) => (
            <div key={id}>
              {i === 4 && (
                <span className="nav-caption secondary-caption">
                  SEU NEGÓCIO
                </span>
              )}
              <button
                className={tab === id ? "selected" : ""}
                onClick={() => go(id)}
                aria-current={tab === id ? "page" : undefined}
              >
                <Icon size={19} />
                <span>{label}</span>
                {id === "inbox" && unread > 0 && <b>{unread}</b>}
                {id === "orders" && data.metrics.pending > 0 && <i />}
              </button>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="mini-spark">
            <Sparkles size={18} />
            <strong>Da conversa à conquista.</strong>
            <p>Sua primeira venda digital começa com um pequeno passo.</p>
            <button onClick={() => go("inbox")}>
              Abrir meu balcão <ArrowRight size={15} />
            </button>
          </div>
          <div className="sidebar-footer">
            <span className="live-dot" />
            {data.integrations.demo
              ? "Ambiente de demonstração"
              : "Operação da loja"}
            <small>v1.0</small>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-btn mobile-menu"
            onClick={() => setMobile(true)}
            aria-label="Abrir menu"
          >
            <Menu size={22} />
          </button>
          <div className="breadcrumbs">
            <span>Meu balcão</span>
            <ChevronRight size={13} />
            <strong>{navs.find((n) => n.id === tab)?.label}</strong>
          </div>
          <div className="top-actions">
            <span
              className={`connection-pill ${data.integrations.whatsapp === "demo" ? "demo" : ""}`}
            >
              <span />
              {data.integrations.whatsapp === "demo"
                ? "WhatsApp simulado"
                : data.integrations.whatsappConfigured
                  ? "WhatsApp configurado"
                  : "WhatsApp pendente"}
            </span>
            <button
              className="icon-btn"
              disabled={loading}
              onClick={reload}
              aria-label="Atualizar dados"
            >
              <RefreshCw size={18} className={loading ? "spin" : ""} />
            </button>
            <button
              className="notification-btn icon-btn"
              onClick={() => go("inbox")}
              aria-label={`${unread} atendimentos com novas mensagens`}
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </button>
            <span className="top-divider" />
            <button
              className="profile-btn"
              onClick={async () => {
                try {
                  await api("logout", request("POST"));
                  setAuth(false);
                  setData(null);
                } catch (e) {
                  notify((e as Error).message, true);
                }
              }}
              title="Sair da conta"
              aria-label="Sair da conta"
            >
              <span>{data.settings.name.slice(0, 1)}</span>
              <LogOut size={16} />
            </button>
          </div>
        </header>
        <main className="workspace-main" id="main">
          {error && (
            <div className="error-box" role="alert">
              Os dados podem estar desatualizados: {error}
            </div>
          )}
          {tab === "overview" && (
            <Overview data={data} go={go} seed={seed} busy={loading} />
          )}{" "}
          {tab === "inbox" && (
            <Inbox data={data} refresh={refresh} notify={notify} />
          )}{" "}
          {tab === "catalog" && (
            <Catalog data={data} refresh={refresh} notify={notify} />
          )}{" "}
          {tab === "orders" && (
            <Orders data={data} refresh={refresh} notify={notify} />
          )}{" "}
          {tab === "integrations" && (
            <Integrations data={data} notify={notify} />
          )}{" "}
          {tab === "settings" && (
            <StoreSettings
              settings={data.settings}
              refresh={refresh}
              notify={notify}
            />
          )}
        </main>
        <footer className="workspace-footer">
          <span>Feito para caber na rotina da sua loja.</span>
          <span>
            Projeto independente · Desafio Tray ·{" "}
            {data.integrations.demo
              ? "Pagamentos simulados"
              : "Sem gateway de pagamento"}
          </span>
        </footer>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? "error" : ""}`}
          role={toast.error ? "alert" : "status"}
        >
          {toast.error ? <CircleHelp size={20} /> : <CheckCheck size={20} />}
          <span>{toast.message}</span>
          <button aria-label="Dispensar aviso" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
