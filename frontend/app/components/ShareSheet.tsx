"use client";

import { useState } from "react";
import { coverUrl, type BandSummary } from "../lib/api";
import { shareOrCopy } from "../lib/share";
import { buildShareCard, shareImage } from "../lib/share-card";
import { useEscClose } from "../lib/useEscClose";
import { useToast } from "./Toast";
import { ShareIcon } from "./icons";

export default function ShareSheet({
  band,
  onClose,
}: {
  band: BandSummary;
  onClose: () => void;
}) {
  useEscClose(onClose);
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const url = `${typeof window !== "undefined" ? window.location.origin : ""}/cd/${band.id}`;
  const subtitle = `${band.owner_name ? band.owner_name + " · " : ""}${band.track_count} faixas`;

  async function shareLink() {
    const r = await shareOrCopy(url, band.name);
    if (r === "copied") toast.success("Link copiado!");
    else if (r === "failed") toast.error("Não foi possível compartilhar.");
    onClose();
  }

  async function shareAsImage() {
    setBusy(true);
    try {
      const blob = await buildShareCard(coverUrl(band.id), band.name, subtitle);
      if (!blob) {
        toast.error("Não foi possível gerar a imagem.");
        return;
      }
      const r = await shareImage(blob, `${band.name}.png`, `${band.name} — ${url}`);
      if (r === "downloaded")
        toast.success("Imagem salva! Poste no seu status. 📲");
      else if (r === "failed") toast.error("Não foi possível compartilhar a imagem.");
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Compartilhar CD"
        className="w-full max-w-md space-y-2 rounded-t-3xl border-t border-white/10 bg-surface p-4 pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-1 h-1 w-10 rounded-full bg-white/20" />
        <p className="px-2 pb-1 text-sm font-bold">Compartilhar “{band.name}”</p>

        <button
          onClick={shareLink}
          disabled={busy}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-sm hover:bg-white/10 disabled:opacity-50"
        >
          <ShareIcon className="h-5 w-5 text-zinc-400" />
          <span>
            <span className="block font-medium">Enviar link</span>
            <span className="block text-xs text-zinc-500">
              Com capa e nome (WhatsApp, Instagram…)
            </span>
          </span>
        </button>

        <button
          onClick={shareAsImage}
          disabled={busy}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-3.5 text-left text-sm hover:bg-white/10 disabled:opacity-50"
        >
          <span className="text-xl">🖼️</span>
          <span>
            <span className="block font-medium">
              {busy ? "Gerando imagem…" : "Imagem para status"}
            </span>
            <span className="block text-xs text-zinc-500">
              Card com a capa para postar no status
            </span>
          </span>
        </button>
      </div>
    </div>
  );
}
