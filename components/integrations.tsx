"use client";

import {
  Activity,
  Copy,
  MessageCircle,
  Plug,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { api } from "@/lib/client";
import { type Snapshot } from "@/lib/types";
import { Badge } from "./shared";

import { time, date, tone, type Notice } from "./ui-types";

export function Integrations({
  data: d,
  notify,
}: {
  data: Snapshot;
  notify: Notice;
}) {
  const items = [
    {
      name: "WhatsApp",
      icon: MessageCircle,
      tone: "green",
      label:
        d.integrations.whatsapp === "demo"
          ? "Simulação local"
          : d.integrations.whatsappConfigured
            ? "Configurado · aguarda validação"
            : "Configuração incompleta",
      description:
        "Receba as conversas e envie o link de compra após sua aprovação.",
      steps: [
        "Escolha o provedor na configuração do servidor.",
        "Configure a instância e a chave da API.",
        "Aponte o webhook para /api/webhooks/whatsapp.",
      ],
      keys: "WHATSAPP_PROVIDER · WHATSAPP_BASE_URL · WHATSAPP_INSTANCE · WHATSAPP_API_KEY · WEBHOOK_SECRET",
    },
    {
      name: "n8n",
      icon: Plug,
      tone: "violet",
      label:
        d.integrations.ai === "n8n" && d.integrations.n8n
          ? "Selecionado · aguarda validação"
          : "Disponível para configurar",
      description:
        "Organize a chamada da IA em um fluxo visual e troque de modelo sem alterar a interface.",
      steps: [
        "Importe o fluxo de exemplo fornecido no projeto.",
        "Configure o modelo de IA e a autenticação de cabeçalho.",
        "Publique o fluxo e use a URL de produção.",
      ],
      keys: "AI_PROVIDER=n8n · N8N_AI_WEBHOOK_URL · N8N_AI_SECRET",
    },
    {
      name: "Cloudflare Workers AI",
      icon: Sparkles,
      tone: "blue",
      label:
        d.integrations.ai === "cloudflare" && d.integrations.cloudflare
          ? "Selecionado · aguarda validação"
          : "Disponível para configurar",
      description:
        "Chame o modelo diretamente pelo backend Next.js, sem precisar hospedar outro Worker.",
      steps: [
        "Crie um token para Workers AI na sua conta.",
        "Defina Account ID, token e modelo no servidor.",
        "Selecione cloudflare como provedor de IA.",
      ],
      keys: "AI_PROVIDER=cloudflare · CLOUDFLARE_ACCOUNT_ID · CLOUDFLARE_API_TOKEN · CLOUDFLARE_MODEL",
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">CONECTE NO SEU RITMO</span>
          <h1>Integrações</h1>
          <p>
            Conexões reais quando você estiver pronto. Simulação para testar
            desde já.
          </p>
        </div>
        <Badge tone="blue">
          <ShieldCheck size={13} />
          Chaves protegidas no servidor
        </Badge>
      </div>
      <div className="integration-recommendation">
        <span>
          <Zap size={23} />
        </span>
        <div>
          <h2>Para a primeira prova: n8n + seu modelo de IA.</h2>
          <p>
            O n8n coordena o fluxo. Workers AI pode ser o modelo chamado por ele
            ou uma alternativa direta. Você escolhe na configuração, sem mudar
            de stack.
          </p>
        </div>
      </div>
      <div className="integrations-grid">
        {items.map((x) => (
          <section className="integration-card" key={x.name}>
            <span className={`integration-icon ${x.tone}`}>
              <x.icon size={28} />
            </span>
            <h2>{x.name}</h2>
            <Badge tone={x.label.startsWith("Simulação") ? "amber" : "neutral"}>
              {x.label}
            </Badge>
            <p>{x.description}</p>
            <ol>
              {x.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <code>{x.keys}</code>
          </section>
        ))}
      </div>
      <section className="panel webhook-card">
        <div>
          <h2>Endereço de entrada das mensagens</h2>
          <p>
            Envie POST com o cabeçalho <code>x-webhook-secret</code>. A URL
            precisa ser acessível pelo provedor.
          </p>
        </div>
        <div className="copy-field">
          <code>/api/webhooks/whatsapp</code>
          <button
            className="btn subtle"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${location.origin}/api/webhooks/whatsapp`,
                );
                notify("Endereço do webhook copiado.");
              } catch {
                notify("Não foi possível copiar automaticamente.", true);
              }
            }}
          >
            <Copy size={15} />
            Copiar URL
          </button>
        </div>
      </section>
      <section className="integration-limits">
        <ShieldCheck size={20} />
        <div>
          <strong>O que está sendo demonstrado</strong>
          <p>
            Pedidos, estoque, reservas e histórico são persistentes. Pagamento
            Pix é simulado. A Tray não está conectada: este é um projeto
            independente para o desafio. A conexão com serviços externos depende
            das suas credenciais e de um teste real.
          </p>
          <p>
            APIs não oficiais de WhatsApp podem falhar ou causar bloqueio do
            número. Use um número dedicado aos testes; para uma operação real,
            avalie a API oficial.
          </p>
        </div>
      </section>
      <section className="panel audit-panel">
        <div className="panel-heading">
          <div>
            <span className="eyebrow">RASTREABILIDADE</span>
            <h2>Atividade recente</h2>
          </div>
          <Badge>{d.audit.length} eventos recentes</Badge>
        </div>
        {d.audit.length ? (
          <div className="audit-list">
            {d.audit.map((a) => (
              <div key={a.id}>
                <span>
                  <Activity size={14} />
                </span>
                <div>
                  <strong>{a.detail}</strong>
                  <small>{a.action}</small>
                </div>
                <time>
                  {date(a.createdAt)} · {time(a.createdAt)}
                </time>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted padded">Os eventos da loja aparecerão aqui.</p>
        )}
      </section>
    </>
  );
}
