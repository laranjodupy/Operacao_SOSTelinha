"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, ImagePlus, Mic, Music2, Sparkles, X } from "lucide-react";
import { api, request } from "@/lib/client";
import type { CatalogDraft, Snapshot } from "@/lib/types";
import { Field, Modal, Spinner } from "./shared";
import type { Notice } from "./ui-types";
type Media = { mimeType: string; dataBase64: string };
export function ProductAssistant({
  data: d,
  onClose,
  onDrafts,
  notify,
}: {
  data: Snapshot;
  onClose: () => void;
  onDrafts: (products: CatalogDraft[], transcription?: string) => void;
  notify: Notice;
}) {
  const [text, setText] = useState(""),
    [image, setImage] = useState<Media | null>(null),
    [audio, setAudio] = useState<Media | null>(null),
    [fileName, setFileName] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [listening, setListening] = useState(false);
  const recognition = useRef<any>(null);
  useEffect(() => () => recognition.current?.abort(), []);
  const listen = () => {
    const w = window as any,
      Speech = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Speech) {
      notify(
        "Este navegador não oferece ditado. Você pode enviar um arquivo de áudio ou digitar a lista.",
        true,
      );
      return;
    }
    const r = new Speech();
    r.lang = "pt-BR";
    r.interimResults = false;
    r.onresult = (e: any) =>
      setText((t) => `${t} ${e.results[0][0].transcript}`.trim());
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      notify(
        "O ditado do navegador não conseguiu transcrever. Confira a permissão ou envie um arquivo de áudio.",
        true,
      );
    };
    recognition.current = r;
    try {
      r.start();
      setListening(true);
    } catch {
      notify("Não foi possível iniciar o microfone. Tente novamente.", true);
    }
  };
  const upload = (f: File | undefined, kind: "image" | "audio") => {
    if (!f) return;
    if (f.size > 3_000_000) {
      setError(
        "Use um arquivo de até 3 MB. Comprima a imagem ou envie um áudio mais curto.",
      );
      return;
    }
    const extension = f.name.split(".").at(-1)?.toLowerCase() || "";
    const fallback: Record<string, string> = {
      mp3: "audio/mpeg",
      m4a: "audio/mp4",
      wav: "audio/wav",
      ogg: "audio/ogg",
      webm: "audio/webm",
      flac: "audio/flac",
      aac: "audio/aac",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
    };
    const mimeType = f.type.split(";")[0] || fallback[extension] || "";
    const reader = new FileReader();
    reader.onerror = () =>
      setError(
        "O navegador não conseguiu ler este arquivo. Tente outro formato.",
      );
    reader.onload = () => {
      const media = {
        mimeType,
        dataBase64: String(reader.result).split(",")[1],
      };
      setImage(kind === "image" ? media : null);
      setAudio(kind === "audio" ? media : null);
      setFileName(f.name);
      setError("");
    };
    reader.readAsDataURL(f);
  };
  return (
    <Modal title="Da descrição ao catálogo" onClose={onClose}>
      <form
        className="form-stack"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          recognition.current?.stop();
          try {
            const r = await api(
              "ai",
              request("POST", { task: "extract_product", text, image, audio }),
            );
            const list = r.products || (r.product ? [r.product] : []);
            if (!list.length)
              throw new Error(
                "Nenhum produto foi identificado. Tente uma descrição mais clara.",
              );
            onDrafts(list, r.transcription);
            notify(
              `${list.length} produto(s) identificado(s). Revise preço e estoque antes de cadastrar.`,
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="assistant-intro">
          <Sparkles size={25} />
          <p>
            Envie uma descrição, uma lista, uma foto ou um áudio. A IA organiza
            até 20 produtos para você revisar.
          </p>
        </div>
        <div className="assistant-provider">
          <span>Provedor selecionado</span>
          <strong>
            {d.integrations.ai === "n8n"
              ? "Webhook n8n"
              : d.integrations.ai === "cloudflare"
                ? "Cloudflare Workers AI"
                : "Local · sem extração por IA"}
          </strong>
        </div>
        {d.integrations.ai === "local" && (
          <div className="demo-notice">
            Configure AI_PROVIDER=cloudflare ou n8n no .env.local e reinicie o
            servidor para ativar a extração.
          </div>
        )}
        <Field
          label="Descrição ou lista de produtos"
          hint="Separe produtos por linha e informe o preço por unidade quando possível."
        >
          <textarea
            maxLength={6000}
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={
              "10 calculadoras científicas, modelo 240, R$ 10 cada\n8 cadernos de 10 matérias, R$ 24,90 cada"
            }
          />
        </Field>
        <div className="assistant-inputs with-audio">
          <label className="upload-area">
            <ImagePlus size={24} />
            <strong>Enviar imagem</strong>
            <small>JPEG, PNG ou WebP · 3 MB</small>
            <input
              aria-label="Enviar imagem do catálogo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => upload(e.target.files?.[0], "image")}
            />
          </label>
          <label className="upload-area">
            <Music2 size={24} />
            <strong>Enviar áudio</strong>
            <small>MP3, M4A, WAV e outros · 3 MB</small>
            <input
              aria-label="Enviar arquivo de áudio"
              type="file"
              accept="audio/*,.m4a,.ogg,.webm,.flac"
              onChange={(e) => upload(e.target.files?.[0], "audio")}
            />
          </label>
          <button
            type="button"
            className={`voice-input ${listening ? "listening" : ""}`}
            onClick={() => (listening ? recognition.current?.stop() : listen())}
          >
            <Mic size={24} />
            <strong>{listening ? "Ouvindo…" : "Ditar pelo navegador"}</strong>
            <small>Voz convertida em texto</small>
          </button>
        </div>
        {(image || audio) && (
          <div className="attached-media">
            <span>
              {audio ? <Music2 size={16} /> : <ImagePlus size={16} />}{" "}
              {fileName}
            </span>
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                setImage(null);
                setAudio(null);
                setFileName("");
              }}
            >
              <X size={14} />
              Remover
            </button>
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <button
          className="btn primary full"
          disabled={
            busy ||
            (!text.trim() && !image && !audio) ||
            d.integrations.ai === "local"
          }
        >
          {busy ? (
            <>
              <Spinner />
              {audio ? "Transcrevendo e extraindo…" : "Extraindo os produtos…"}
            </>
          ) : (
            <>
              <Sparkles size={17} />
              Extrair e revisar produtos
              <ArrowRight size={17} />
            </>
          )}
        </button>
        <p className="microcopy">
          {audio
            ? "O arquivo de áudio será enviado ao provedor para transcrição e extração."
            : image
              ? "A imagem será enviada ao provedor de IA configurado."
              : "O texto é enviado ao provedor de IA. O ditado depende do serviço do navegador."}{" "}
          Nada é cadastrado antes da sua revisão.
        </p>
      </form>
    </Modal>
  );
}
