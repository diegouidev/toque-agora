"use client";

import { useEffect, useState } from "react";
import type { Track } from "../lib/api";
import { useDownloads } from "../lib/downloads";
import type { OfflineTrackMeta } from "../lib/offline-db";
import { useEscClose } from "../lib/useEscClose";
import TrackList from "./TrackList";
import { CloseIcon } from "./icons";

function mb(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// OfflineTrackMeta → Track (o player usa id/display_name/duration; o resto é
// preenchido com placeholders, pois o src offline é resolvido pelo id).
function toTrack(m: OfflineTrackMeta): Track {
  return {
    id: m.id,
    band_id: m.band_id,
    name: "",
    display_name: m.display_name,
    size: 0,
    index: 0,
    duration: m.duration,
    is_favorite: false,
  };
}

interface Props {
  onClose: () => void;
  onPlay: (tracks: Track[], index: number) => void;
  currentTrackId: number | null;
  isPlaying: boolean;
}

export default function DownloadsView({
  onClose,
  onPlay,
  currentTrackId,
  isPlaying,
}: Props) {
  useEscClose(onClose);
  const dl = useDownloads();
  const [items, setItems] = useState<OfflineTrackMeta[]>([]);

  // Recarrega a lista quando o conjunto de baixados muda (baixar/remover).
  // `listDownloads` é estável (função de módulo), então o efeito só dispara por dl.ids.
  const { listDownloads, ids } = dl;
  useEffect(() => {
    let alive = true;
    listDownloads()
      .then((list) => {
        if (alive) setItems(list);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [listDownloads, ids]);

  const tracks = items.map(toTrack);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Músicas baixadas"
        className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-xl font-black">Baixados</h2>
            <p className="text-xs text-zinc-400">
              {items.length} faixa{items.length === 1 ? "" : "s"} · {mb(dl.usage)} usados
              {!dl.online && " · offline"}
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

        {dl.blocked && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-200">
            Sua licença offline expirou. Reconecte à internet com a assinatura ativa
            para liberar seus downloads.
          </div>
        )}

        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-zinc-500">
            Nenhuma música baixada. Toque no ícone de baixar (📥) numa faixa para
            ouvir sem internet.
          </p>
        ) : (
          <>
            <div className="max-h-[55vh] overflow-y-auto">
              <TrackList
                tracks={tracks}
                currentTrackId={currentTrackId}
                isPlaying={isPlaying}
                onSelect={(i) => onPlay(tracks, i)}
              />
            </div>
            <button
              onClick={() => dl.clearAll()}
              className="w-full rounded-full border border-white/10 py-2 text-sm text-red-400 hover:bg-white/5"
            >
              Limpar todos os downloads
            </button>
          </>
        )}
      </div>
    </div>
  );
}
