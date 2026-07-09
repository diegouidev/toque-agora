"use client";

import JSZip from "jszip";
import { useRef, useState } from "react";
import {
  uploadAbortEndpoint,
  uploadChunkEndpoint,
  uploadCompleteEndpoint,
  type QuotaExceeded,
  type UploadResult,
} from "../lib/api";

// Arquivos que valem a pena zipar de uma pasta (o indexador só usa MP3 + capa).
const FOLDER_KEEP = /\.(mp3|jpe?g|png|webp|gif)$/i;

interface Props {
  onUploaded: (result: UploadResult) => void;
  onQuotaExceeded?: (info: QuotaExceeded) => void;
  // Se informado, os CDs enviados já nascem marcados com esta categoria.
  categoryId?: number | null;
}

interface FileProgress {
  name: string;
  percent: number;
  done: boolean;
  error?: string;
}

type UploadOneResult = { result?: UploadResult; error?: string; quota?: QuotaExceeded };

// Arquivo de uma pasta com seu caminho relativo (inclui a pasta de topo).
type FolderFile = { file: File; rel: string };

// Tamanho de cada pedaço enviado. Abaixo de 100 MB para passar pelo limite de
// corpo da Cloudflare/proxy (plano Free = 100 MB).
const CHUNK_SIZE = 90 * 1024 * 1024;

// POST com progresso de upload (XHR). Resolve com status + corpo bruto.
function xhrPost(
  url: string,
  body: XMLHttpRequestBodyInit,
  onProgress?: (loadedBytes: number) => void,
): Promise<{ status: number; text: string }> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", url);
    xhr.withCredentials = true; // envia o cookie de sessão HttpOnly
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded);
      };
    }
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => resolve({ status: 0, text: "" });
    xhr.send(body);
  });
}

// Lê recursivamente uma entrada do drag & drop, coletando arquivos com o
// caminho relativo (fullPath sem a barra inicial — mesmo formato do
// webkitRelativePath do input de pasta).
async function collectEntry(entry: FileSystemEntry, out: FolderFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((resolve, reject) =>
      (entry as FileSystemFileEntry).file(resolve, reject),
    );
    out.push({ file, rel: entry.fullPath.replace(/^\/+/, "") });
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries devolve no máximo ~100 entradas por chamada; repete até esvaziar.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) await collectEntry(child, out);
    }
  }
}

// Agrupa os arquivos pela pasta de topo — cada grupo vira um .zip separado.
function groupByTopFolder(files: FolderFile[]): Map<string, FolderFile[]> {
  const groups = new Map<string, FolderFile[]>();
  for (const f of files) {
    const top = f.rel.split("/")[0] || "pasta";
    const group = groups.get(top);
    if (group) group.push(f);
    else groups.set(top, [f]);
  }
  return groups;
}

// Zipa UMA pasta (STORE = sem recomprimir), preservando a estrutura interna.
// Devolve null se a pasta não tiver MP3s aproveitáveis.
async function zipFolderFiles(
  folderName: string,
  files: FolderFile[],
  onProgress: (percent: number) => void,
): Promise<File | null> {
  const list = files.filter((f) => FOLDER_KEEP.test(f.rel));
  if (list.length === 0) return null;
  const zip = new JSZip();
  for (const f of list) {
    // Remove o 1º segmento (pasta escolhida) para preservar a estrutura interna:
    // subpastas viram bandas; MP3s na raiz viram um CD com o nome da pasta.
    const inner = f.rel.split("/").slice(1).join("/") || f.file.name;
    zip.file(inner, f.file);
  }
  const blob = await zip.generateAsync(
    { type: "blob", compression: "STORE" },
    (meta) => onProgress(Math.round(meta.percent)),
  );
  return new File([blob], `${folderName}.zip`, { type: "application/zip" });
}

// Interpreta um 413: (a) quota estruturada → modal; (b) corpo grande demais.
function parse413(text: string): UploadOneResult {
  try {
    const d = JSON.parse(text).detail;
    if (d && d.code === "quota_exceeded") return { quota: d as QuotaExceeded };
    return { error: typeof d === "string" ? d : "Pedaço grande demais para o servidor." };
  } catch {
    return {
      error:
        "Pedaço grande demais para o servidor (limite do proxy/Cloudflare). " +
        "Reduza o tamanho do pedaço.",
    };
  }
}

export default function Uploader({ onUploaded, onQuotaExceeded, categoryId }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [items, setItems] = useState<FileProgress[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Progresso de compactação das pastas (antes de começar o upload).
  const [zipping, setZipping] = useState<{ label: string; percent: number } | null>(null);

  function pickFiles() {
    inputRef.current?.click();
  }

  // Zipa cada pasta (uma por vez, com progresso) e envia todas num lote só,
  // pelo MESMO fluxo chunked — herda progresso, quota, prévia e categoria.
  // `extraFiles` são .rar/.zip soltos arrastados junto com as pastas.
  async function zipAndUpload(folders: Map<string, FolderFile[]>, extraFiles: File[] = []) {
    setError(null);
    const zips: File[] = [];
    const skipped: string[] = [];
    const names = Array.from(folders.keys());
    try {
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const label =
          names.length > 1 ? `“${name}” (${i + 1}/${names.length})` : `“${name}”`;
        setZipping({ label, percent: 0 });
        const zipFile = await zipFolderFiles(name, folders.get(name)!, (percent) =>
          setZipping({ label, percent }),
        );
        if (zipFile) zips.push(zipFile);
        else skipped.push(name);
      }
    } catch {
      setZipping(null);
      setError("Falha ao preparar as pastas.");
      return;
    }
    setZipping(null);

    const all = [...zips, ...extraFiles];
    if (all.length === 0) {
      setError(
        skipped.length === 1
          ? `A pasta “${skipped[0]}” não tem MP3s.`
          : "Nenhuma das pastas tem MP3s.",
      );
      return;
    }
    await upload(all);
    if (skipped.length > 0) {
      setError(`Sem MP3s (ignoradas): ${skipped.join(", ")}`);
    }
  }

  // Pasta escolhida pelo botão (webkitdirectory — o navegador só deixa UMA por
  // vez; para várias de uma vez, o caminho é arrastar para a área de drop).
  async function zipFolder(files: FileList) {
    const folderFiles: FolderFile[] = Array.from(files).map((f) => ({
      file: f,
      rel: f.webkitRelativePath || f.name,
    }));
    await zipAndUpload(groupByTopFolder(folderFiles));
  }

  // Drop contendo pastas: lê cada uma recursivamente e zipa separadamente.
  // Permite arrastar VÁRIAS pastas de uma vez (misturadas ou não com .rar/.zip).
  async function dropEntries(entries: FileSystemEntry[]) {
    setError(null);
    const folderFiles: FolderFile[] = [];
    const loose: File[] = [];
    try {
      for (const entry of entries) {
        if (entry.isDirectory) {
          await collectEntry(entry, folderFiles);
        } else if (entry.isFile && /\.(rar|zip)$/i.test(entry.name)) {
          loose.push(
            await new Promise<File>((resolve, reject) =>
              (entry as FileSystemFileEntry).file(resolve, reject),
            ),
          );
        }
      }
    } catch {
      setError("Falha ao ler as pastas arrastadas.");
      return;
    }
    await zipAndUpload(groupByTopFolder(folderFiles), loose);
  }

  // Envia UM arquivo em pedaços (<100 MB cada) e finaliza com /complete.
  // Mantém cada requisição pequena para passar pelo limite do proxy/Cloudflare.
  async function uploadOne(
    file: File,
    onProgress: (pct: number) => void,
  ): Promise<UploadOneResult> {
    const uploadId = (
      crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
    ).replace(/[^A-Za-z0-9_-]/g, "");
    const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    let sentBytes = 0; // bytes já confirmados (pedaços anteriores)

    for (let i = 0; i < total; i++) {
      const start = i * CHUNK_SIZE;
      const blob = file.slice(start, Math.min(start + CHUNK_SIZE, file.size));
      const form = new FormData();
      form.append("upload_id", uploadId);
      form.append("chunk_index", String(i));
      form.append("total_chunks", String(total));
      form.append("chunk", blob, file.name);

      const res = await xhrPost(uploadChunkEndpoint(), form, (loaded) =>
        onProgress(Math.round(((sentBytes + loaded) / file.size) * 100)),
      );

      if (res.status === 413) {
        void abort(uploadId);
        return parse413(res.text);
      }
      if (res.status !== 204 && res.status !== 200) {
        void abort(uploadId);
        if (res.status === 0) return { error: "Erro de rede." };
        let detail = "Falha no upload.";
        try {
          const d = JSON.parse(res.text).detail;
          if (typeof d === "string") detail = d;
        } catch {
          /* mantém padrão */
        }
        return { error: detail };
      }
      sentBytes += blob.size;
    }

    // Finaliza: o servidor valida (magic), indexa as bandas e responde 201.
    try {
      const res = await fetch(uploadCompleteEndpoint(), {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          upload_id: uploadId,
          filename: file.name,
          category_id: categoryId ?? null,
        }),
      });
      if (res.status === 201) {
        return { result: (await res.json()) as UploadResult };
      }
      if (res.status === 413) {
        const text = await res.text();
        return parse413(text);
      }
      const d = await res.json().catch(() => ({}));
      return {
        error: typeof d.detail === "string" ? d.detail : "Falha ao finalizar o upload.",
      };
    } catch {
      return { error: "Erro de rede ao finalizar." };
    }
  }

  // Limpeza best-effort do arquivo temporário no servidor (não bloqueia).
  function abort(uploadId: string): void {
    const form = new FormData();
    form.append("upload_id", uploadId);
    void xhrPost(uploadAbortEndpoint(), form);
  }

  async function upload(files: FileList | File[]) {
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
        // As entradas precisam ser coletadas AINDA no evento (síncrono):
        // o navegador invalida o dataTransfer assim que o handler retorna.
        const entries: FileSystemEntry[] = [];
        for (const item of Array.from(e.dataTransfer.items ?? [])) {
          const entry = item.webkitGetAsEntry?.();
          if (entry) entries.push(entry);
        }
        if (entries.some((en) => en.isDirectory)) {
          void dropEntries(entries);
        } else if (e.dataTransfer.files?.length) {
          upload(e.dataTransfer.files);
        }
      }}
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
        dragging
          ? "border-accent bg-accent/10"
          : "border-zinc-700"
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
      {/* Input de pasta (webkitdirectory) — zipado no cliente antes de enviar. */}
      <input
        ref={folderRef}
        type="file"
        multiple
        className="hidden"
        // webkitdirectory/directory não estão nos tipos padrão do React.
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(e) => {
          if (e.target.files?.length) zipFolder(e.target.files);
          e.target.value = "";
        }}
      />

      {zipping !== null ? (
        <div className="w-full max-w-md space-y-2" onClick={(e) => e.stopPropagation()}>
          <p className="text-sm font-medium">
            Preparando {zipping.label}… {zipping.percent}%
          </p>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-700">
            <div
              className="h-full bg-accent transition-[width]"
              style={{ width: `${zipping.percent}%` }}
            />
          </div>
        </div>
      ) : !items ? (
        <>
          <div className="text-3xl">📦</div>
          <p className="font-medium">
            Arraste pastas ou <span className="font-mono">.rar</span>/
            <span className="font-mono">.zip</span> aqui, ou escolha:
          </p>
          <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={pickFiles}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-sm font-bold text-black transition-transform hover:scale-[1.02]"
            >
              📦 Enviar arquivo
            </button>
            <button
              type="button"
              onClick={() => folderRef.current?.click()}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-zinc-200 hover:bg-white/10"
            >
              📁 Enviar pasta
            </button>
          </div>
          <p className="text-xs text-zinc-500">
            Cada subpasta vira uma banda. Dica: para enviar várias pastas de uma
            vez, arraste todas juntas para cá.
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
