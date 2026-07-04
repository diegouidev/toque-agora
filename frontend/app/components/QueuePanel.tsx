"use client";

import type { Track } from "../lib/api";
import { useEscClose } from "../lib/useEscClose";
import TrackList from "./TrackList";
import { CloseIcon } from "./icons";

interface Props {
  current: Track | null;
  bandName: string | null;
  isPlaying: boolean;
  upcoming: Track[];
  onSelectUpcoming: (track: Track) => void;
  onReorderUpcoming: (newOrder: Track[]) => void;
  onRemoveFromQueue: (track: Track) => void;
  onClose: () => void;
}

/** Painel lateral (drawer) com a fila: tocando agora + a seguir. */
export default function QueuePanel({
  current,
  bandName,
  isPlaying,
  upcoming,
  onSelectUpcoming,
  onReorderUpcoming,
  onRemoveFromQueue,
  onClose,
}: Props) {
  useEscClose(onClose);
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Fila de reprodução"
        className="flex h-full w-full max-w-md flex-col border-l border-white/10 bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
          <h2 className="text-lg font-bold">Fila</h2>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-zinc-400 hover:bg-white/10 hover:text-white"
            aria-label="Fechar"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="scroll-area flex-1 overflow-y-auto p-3">
          {/* Tocando agora */}
          <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">
            Tocando agora
          </p>
          {current ? (
            <div className="mb-4 flex items-center gap-3 rounded-lg bg-white/10 px-3 py-2.5">
              <span className="text-accent">♪</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-accent">
                  {current.display_name}
                </p>
                <p className="truncate text-xs text-zinc-400">{bandName ?? "—"}</p>
              </div>
            </div>
          ) : (
            <p className="mb-4 px-2 text-sm text-zinc-500">Nada tocando.</p>
          )}

          {/* A seguir */}
          <p className="px-2 pb-2 text-xs font-bold uppercase tracking-wide text-zinc-400">
            A seguir
          </p>
          {upcoming.length > 0 ? (
            <TrackList
              tracks={upcoming}
              currentTrackId={null}
              isPlaying={isPlaying}
              onSelect={(i) => onSelectUpcoming(upcoming[i])}
              onRemove={onRemoveFromQueue}
              onReorder={onReorderUpcoming}
            />
          ) : (
            <p className="px-2 py-6 text-center text-sm text-zinc-500">
              Fim da fila.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
