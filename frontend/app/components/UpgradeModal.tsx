"use client";

import { type QuotaExceeded, whatsappUpgradeUrl } from "../lib/api";

interface Props {
  info: QuotaExceeded;
  email: string;
  onClose: () => void;
}

export default function UpgradeModal({ info, email, onClose }: Props) {
  const hasWhats = !!info.whatsapp;
  const url = hasWhats
    ? whatsappUpgradeUrl(info.whatsapp, email, info.used_gb, info.quota_gb)
    : "#";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-surface p-6 text-center shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/20 text-3xl">
          📦
        </div>
        <h2 className="text-lg font-bold">Espaço cheio</h2>
        <p className="text-sm text-zinc-300">
          Você usou <b>{info.used_gb} GB</b> de <b>{info.quota_gb} GB</b>. Para enviar
          mais músicas, compre mais espaço com o administrador.
        </p>

        {hasWhats ? (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full rounded-full bg-[#25D366] py-3 text-sm font-bold text-black transition-transform hover:scale-[1.02]"
          >
            💬 Comprar mais GB no WhatsApp
          </a>
        ) : (
          <p className="text-xs text-amber-400">
            WhatsApp do admin não configurado. Fale diretamente com o administrador.
          </p>
        )}

        <button
          onClick={onClose}
          className="w-full rounded-full border border-white/10 py-2.5 text-sm text-zinc-300 hover:bg-white/5"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
