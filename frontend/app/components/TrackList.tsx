"use client";

import { useState } from "react";
import type { Track } from "../lib/api";
import { DragIcon, EditIcon, HeartIcon, PlayIcon, PlusIcon, QueueIcon } from "./icons";

interface Props {
  tracks: Track[];
  currentTrackId: number | null;
  isPlaying: boolean;
  onSelect: (index: number) => void;
  onToggleFavorite?: (track: Track) => void;
  onAddToPlaylist?: (track: Track) => void;
  onPlayNext?: (track: Track) => void; // "Tocar depois" (adiciona à fila)
  onRename?: (track: Track) => void; // renomear (dono/admin)
  onRemove?: (track: Track) => void; // contexto de playlist
  onReorder?: (newOrder: Track[]) => void; // habilita drag-and-drop (playlist)
}

function fmtDuration(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function TrackList({
  tracks,
  currentTrackId,
  isPlaying,
  onSelect,
  onToggleFavorite,
  onAddToPlaylist,
  onPlayNext,
  onRename,
  onRemove,
  onReorder,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function handleDrop(target: number) {
    if (dragIndex == null || dragIndex === target) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...tracks];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(target, 0, moved);
    setDragIndex(null);
    setOverIndex(null);
    onReorder?.(next);
  }

  if (tracks.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-2 py-12 text-center">
        <span className="text-4xl opacity-40">🎶</span>
        <p className="text-sm text-zinc-500">Nenhuma faixa por aqui ainda.</p>
      </div>
    );
  }

  return (
    <ul className="space-y-0.5">
      {tracks.map((track, i) => {
        const active = track.id === currentTrackId;
        const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
        return (
          <li
            key={track.id}
            onDragOver={(e) => {
              if (!onReorder) return;
              e.preventDefault();
              setOverIndex(i);
            }}
            onDrop={() => onReorder && handleDrop(i)}
            className={isOver ? "border-t-2 border-accent" : ""}
          >
            <div
              role="button"
              tabIndex={0}
              onClick={() => onSelect(i)}
              className={`group flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors sm:gap-4 sm:px-4 ${
                active ? "bg-white/10" : "hover:bg-white/5"
              } ${dragIndex === i ? "opacity-40" : ""}`}
            >
              {/* Handle de arrasto (só em playlist) */}
              {onReorder && (
                <span
                  draggable
                  onDragStart={() => setDragIndex(i)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setOverIndex(null);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="shrink-0 cursor-grab text-zinc-600 hover:text-white active:cursor-grabbing"
                  aria-label="Arrastar para reordenar"
                  title="Arrastar"
                >
                  <DragIcon className="h-4 w-4" />
                </span>
              )}
              <span className="flex w-6 shrink-0 items-center justify-center text-sm tabular-nums text-zinc-500">
                {active && isPlaying ? (
                  <Equalizer />
                ) : (
                  <>
                    <span className={`group-hover:hidden ${active ? "text-accent" : ""}`}>
                      {i + 1}
                    </span>
                    <PlayIcon className="ml-0.5 hidden h-3.5 w-3.5 text-white group-hover:block" />
                  </>
                )}
              </span>
              <span
                className={`min-w-0 flex-1 truncate ${
                  active ? "font-semibold text-accent" : "text-zinc-100"
                }`}
              >
                {track.display_name}
              </span>

              {/* Curtir */}
              {onToggleFavorite && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(track);
                  }}
                  className={`shrink-0 p-1 transition-colors ${
                    track.is_favorite
                      ? "text-accent"
                      : "text-zinc-500 opacity-0 hover:text-white group-hover:opacity-100"
                  }`}
                  aria-label={track.is_favorite ? "Descurtir" : "Curtir"}
                  title={track.is_favorite ? "Descurtir" : "Curtir"}
                >
                  <HeartIcon className="h-4 w-4" filled={track.is_favorite} />
                </button>
              )}

              {/* Tocar depois (adicionar à fila) */}
              {onPlayNext && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayNext(track);
                  }}
                  className="shrink-0 p-1 text-zinc-500 opacity-0 transition hover:text-white group-hover:opacity-100"
                  aria-label="Tocar depois"
                  title="Tocar depois"
                >
                  <QueueIcon className="h-4 w-4" />
                </button>
              )}

              {/* Adicionar a playlist */}
              {onAddToPlaylist && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onAddToPlaylist(track);
                  }}
                  className="shrink-0 p-1 text-zinc-500 opacity-0 transition hover:text-white group-hover:opacity-100"
                  aria-label="Adicionar a playlist"
                  title="Adicionar a playlist"
                >
                  <PlusIcon className="h-4 w-4" />
                </button>
              )}

              {/* Renomear (dono/admin) */}
              {onRename && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRename(track);
                  }}
                  className="shrink-0 p-1 text-zinc-500 opacity-0 transition hover:text-white group-hover:opacity-100"
                  aria-label="Renomear faixa"
                  title="Renomear"
                >
                  <EditIcon className="h-4 w-4" />
                </button>
              )}

              {/* Remover (contexto playlist) */}
              {onRemove && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(track);
                  }}
                  className="shrink-0 p-1 text-zinc-500 opacity-0 transition hover:text-red-400 group-hover:opacity-100"
                  aria-label="Remover"
                  title="Remover da playlist"
                >
                  ✕
                </button>
              )}

              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-500">
                {fmtDuration(track.duration)}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Barrinhas animadas estilo equalizer na faixa que está tocando. */
function Equalizer() {
  return (
    <span className="flex h-3.5 items-end gap-[2px]">
      <span className="w-[3px] origin-bottom rounded-sm bg-accent animate-bar-1" style={{ height: "100%" }} />
      <span className="w-[3px] origin-bottom rounded-sm bg-accent animate-bar-2" style={{ height: "100%" }} />
      <span className="w-[3px] origin-bottom rounded-sm bg-accent animate-bar-3" style={{ height: "100%" }} />
    </span>
  );
}
