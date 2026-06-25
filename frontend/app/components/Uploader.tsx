"use client";

import { useRef, useState } from "react";
import {
  uploadEndpoint,
  type QuotaExceeded,
  type UploadResult,
} from "../lib/api";

interface Props {
  onUploaded: (result: UploadResult) => void;
  onQuotaExceeded?: (info: QuotaExceeded) => void;
}

interface FileProgress {
  name: string;
  percent: number;
  done: boolean;
  error?: string;
}

export default function Uploader({ onUploaded, onQuotaExceeded }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<FileProgress[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function pickFiles() {
    inputRef.current?.click();
  }

  // Envia UM arquivo (XHR para ter progresso). Resolve com o resultado parcial.
  function uploadOne(
    file: File,
    onProgress: (pct: number) => void,
  ): Promise<{ result?: UploadResult; error?: string; quota?: QuotaExceeded }> {
    return new Promise((resolve) => {
      const form = new FormData();
      form.append("files", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", uploadEndpoint());
      // Envia o cookie de sessão HttpOnly junto.
      xhr.withCredentials = true;

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
      };

      xhr.onload = () => {
        if (xhr.status === 201) {
          try {
            resolve({ result: JSON.parse(xhr.responseText) as UploadResult });
          } catch {
            resolve({ error: "Resposta inválida do servidor." });
          }
        } else if (xhr.status === 413) {
          // Quota excedida — detail estruturado.
          try {
            const d = JSON.parse(xhr.responseText).detail;
            if (d && d.code === "quota_exceeded") {
              resolve({ quota: d as QuotaExceeded });
              return;
            }
            resolve({ error: typeof d === "string" ? d : "Quota excedida." });
          } catch {
            resolve({ error: "Quota excedida." });
          }
        } else {
          let detail = "Falha no upload.";
          try {
            const d = JSON.parse(xhr.responseText).detail;
            if (typeof d === "string") detail = d;
          } catch {
            /* mantém padrão */
          }
          resolve({ error: detail });
        }
      };

      xhr.onerror = () => resolve({ error: "Erro de rede." });
      xhr.send(form);
    });
  }

  async function upload(files: FileList) {
    setError(null);
    const valid = Array.from(files).filter((f) => {
      const n = f.name.toLowerCase();
      return n.endsWith(".rar") || n.endsWith(".zip");
    });
    if (valid.length === 0) {
      setError("Selecione um ou mais arquivos .rar ou .zip.");
      return;
    }

    setItems(valid.map((f) => ({ name: f.name, percent: 0, done: false })));

    const merged: UploadResult = { bands: [], errors: [] };

    // Sequencial: um POST por arquivo (evita request gigante e dá progresso por arquivo).
    for (let i = 0; i < valid.length; i++) {
      const file = valid[i];
      const res = await uploadOne(file, (pct) =>
        setItems((cur) =>
          cur ? cur.map((it, j) => (j === i ? { ...it, percent: pct } : it)) : cur,
        ),
      );

      if (res.quota) {
        // Para o lote e dispara o fluxo de upgrade (modal WhatsApp).
        setItems((cur) =>
          cur
            ? cur.map((it, j) =>
                j === i ? { ...it, done: true, error: "Quota excedida" } : it,
              )
            : cur,
        );
        onQuotaExceeded?.(res.quota);
        break;
      }

      if (res.result) {
        merged.bands.push(...res.result.bands);
        merged.errors.push(...res.result.errors);
      }
      const errMsg = res.error ?? res.result?.errors[0]?.detail;
      setItems((cur) =>
        cur
          ? cur.map((it, j) =>
              j === i ? { ...it, percent: 100, done: true, error: errMsg } : it,
            )
          : cur,
      );
    }

    onUploaded(merged);
    // Some com a lista após um tempinho se tudo deu certo.
    setTimeout(() => setItems(null), 1500);
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files?.length) upload(e.dataTransfer.files);
      }}
      onClick={pickFiles}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragging
          ? "border-accent bg-accent/10"
          : "border-zinc-700 hover:border-zinc-500 hover:bg-white/5"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".rar,.zip"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) upload(e.target.files);
          e.target.value = "";
        }}
      />

      {!items ? (
        <>
          <div className="text-3xl">📦</div>
          <p className="font-medium">
            Arraste um ou vários <span className="font-mono">.rar</span> ou{" "}
            <span className="font-mono">.zip</span> aqui ou clique
          </p>
          <p className="text-sm text-zinc-400">
            Cada subpasta dentro do arquivo vira uma banda na sua coleção
          </p>
        </>
      ) : (
        <div className="w-full max-w-md space-y-2" onClick={(e) => e.stopPropagation()}>
          {items.map((it) => (
            <div key={it.name}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="truncate text-zinc-300">{it.name}</span>
                <span className={it.error ? "text-red-400" : "text-zinc-400"}>
                  {it.error ? it.error : it.done ? "ok" : `${it.percent}%`}
                </span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
                <div
                  className={`h-full transition-[width] ${
                    it.error ? "bg-red-500" : "bg-accent"
                  }`}
                  style={{ width: `${it.percent}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
