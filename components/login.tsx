"use client";
import { useState } from "react";
import { ArrowRight, ShieldCheck, Store, Zap } from "lucide-react";
import { api, request } from "@/lib/client";

import { Badge, Brand, CheckLine, Field, Spinner } from "./shared";

import { tone } from "./ui-types";

export function Login({
  onLogin,
  error: initial,
}: {
  onLogin: () => void;
  error: string;
}) {
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [error, setError] = useState(initial),
    [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api("login", request("POST", { email, password }));
      onLogin();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="login-page">
      <section className="login-story">
        <Brand light />
        <div className="login-copy">
          <Badge tone="white">
            <Zap size={12} /> DO BALCÃO PARA O DIGITAL
          </Badge>
          <h1>
            O atendimento
            <br />
            continua.
            <br />
            <span>A venda acontece.</span>
          </h1>
          <p>
            Uma ponte entre as conversas do WhatsApp e a primeira venda online
            da sua loja.
          </p>
          <div className="login-steps">
            <CheckLine done>Produtos organizados em poucos passos</CheckLine>
            <CheckLine done>Um link, um pedido, tudo no lugar</CheckLine>
            <CheckLine done>Você no controle do começo ao fim</CheckLine>
          </div>
        </div>
        <small>
          Projeto independente para o desafio Tray · Hackathon Connect 7.0
        </small>
        <div className="decor-orbit one" />
        <div className="decor-orbit two" />
      </section>
      <section className="login-form-area">
        <form className="login-form" onSubmit={submit}>
          <span className="hello-icon">
            <Store size={27} />
          </span>
          <span className="eyebrow">BEM-VINDO AO SEU BALCÃO</span>
          <h2>Vamos fazer a loja crescer?</h2>
          <p>
            Entre para organizar seus atendimentos e transformar conversas em
            vendas.
          </p>
          <Field label="E-mail">
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com"
            />
          </Field>
          <Field label="Senha">
            <input
              type="password"
              autoComplete="current-password"
              required
              maxLength={1024}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Sua senha de acesso"
            />
          </Field>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <button className="btn primary full" disabled={busy}>
            {busy ? (
              <Spinner />
            ) : (
              <>
                Entrar no balcão <ArrowRight size={18} />
              </>
            )}
          </button>
          <div className="login-help">
            <ShieldCheck size={17} />
            <span>
              Entre com a conta de administrador cadastrada para esta loja.
            </span>
          </div>
        </form>
      </section>
    </main>
  );
}
