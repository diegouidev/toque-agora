"use client";

import type { QuotaExceeded, UploadResult } from "../lib/api";
import { CloseIcon } from "./icons";
import Uploader from "./Uploader";

interface Props {
  onUploaded: (result: UploadResult) => void;
  onQuotaExceeded?: (info: QuotaExceeded) => void;
  onClose: () => void;
}

/** Moldura de modal em volta do <Uploader> existente (acionado por botão). */
export default function UploadModal({ onUploaded, onQuotaExceeded, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">Enviar coleção</h2>
            <p className="text-sm text-zinc-400">
              Cada subpasta dentro do arquivo vira uma banda
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <Uploader onUploaded={onUploaded} onQuotaExceeded={onQuotaExceeded} />
      </div>
    </div>
  );
}
