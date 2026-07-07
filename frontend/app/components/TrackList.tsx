"use client";

import { useRef, useState } from "react";
import type { Track } from "../lib/api";
import { useDownloads } from "../lib/downloads";
import Marquee from "./Marquee";
import { useToast } from "./Toast";
import {
  DownloadIcon,
  DragIcon,
  EditIcon,
  HeartIcon,
  MoreIcon,
  OfflineIcon,
  PlayIcon,
  PlusIcon,
  QueueIcon,
  ShareIcon,
} from "./icons";

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
  onDownload?: (track: Track) => void; // baixar MP3 (dono/admin)
  onShare?: (track: Track) => void; // compartilhar o CD da faixa
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
  onDownload,
  onShare,
}: Props) {
  const dl = useDownloads();
  const toast = useToast();

  async function toggleOffline(track: Track) {
    if (dl.isDownloaded(track.id)) {
      await dl.remove(track.id);
      toast.info("Download removido.");
      return;
    }
    try {
      await dl.download(track);
      toast.success("Baixado para ouvir offline.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao baixar.");
    }
  }

  // Menu "⋮" por faixa — bottom-sheet (desliza de baixo; bom para o toque).
  const [menuTrack, setMenuTrack] = useState<Track | null>(null);
  function openMenu(e: React.MouseEvent, track: Track) {
    e.stopPropagation();
    setMenuTrack(track);
  }
  const closeMenu = () => setMenuTrack(null);

  const hasMenu = (t: Track): boolean =>
    !!(
      onAddToPlaylist ||
      onPlayNext ||
      dl.licenseValid ||
      onDownload ||
      onRename ||
      onRemove ||
      onShare
    ) && !!t;

  // Drag-and-drop com Pointer Events (funciona no MOUSE e no TOQUE — o HTML5
  // drag nativo não dispara em telas de toque). Estado para o visual; refs para
  // a lógica (evita closure obsoleto dentro dos handlers de ponteiro).
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const fromRef = useRef<number | null>(null);
  const overRef = useRef<number | null>(null);

  function startDrag(e: React.PointerEvent, i: number) {
    if (!onReorder) return;
    fromRef.current = i;
    overRef.current = i;
    setDragIndex(i);
    setOverIndex(i);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function moveDrag(e: React.PointerEvent) {
    if (fromRef.current == null) return;
    const el = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
    const li = el?.closest<HTMLElement>("[data-track-index]");
    if (li) {
      const idx = Number(li.dataset.trackIndex);
      if (!Number.isNaN(idx)) {
        overRef.current = idx;
        setOverIndex(idx);
      }
    }
  }
  function endDrag() {
    const from = fromRef.current;
    const to = overRef.current;
    fromRef.current = null;
    overRef.current = null;
    setDragIndex(null);
    setOverIndex(null);
    if (from == null || to == null || from === to) return;
    const next = [...tracks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
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
    <>
      <ul className="space-y-0.5">
        {tracks.map((track, i) => {
          const active = track.id === currentTrackId;
          const isOver = overIndex === i && dragIndex !== null && dragIndex !== i;
          return (
            <li
              key={track.id}
              data-track-index={i}
              className={isOver ? "border-t-2 border-accent" : ""}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => onSelect(i)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(i);
                  }
                }}
                className={`group flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent/70 sm:gap-4 sm:px-4 ${
                  active ? "bg-white/10" : "hover:bg-white/5"
                } ${dragIndex === i ? "opacity-40" : ""}`}
              >
                {/* Handle de arrasto (só em playlist) — Pointer Events p/ funcionar no toque */}
                {onReorder && (
                  <span
                    onPointerDown={(e) => startDrag(e, i)}
                    onPointerMove={moveDrag}
                    onPointerUp={endDrag}
                    onClick={(e) => e.stopPropagation()}
                    style={{ touchAction: "none" }}
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

                {/* Nome — desliza (marquee) só na faixa que está tocando */}
                <div className="min-w-0 flex-1">
                  <Marquee
                    text={track.display_name}
                    active={active}
                    className={active ? "font-semibold text-accent" : "text-zinc-100"}
                  />
                </div>

                {/* Curtir (única ação inline) */}
                {onToggleFavorite && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(track);
                    }}
                    className={`shrink-0 p-1 transition-colors ${
                      track.is_favorite
                        ? "text-accent"
                        : "text-zinc-500 hover:text-white"
                    }`}
                    aria-label={track.is_favorite ? "Descurtir" : "Curtir"}
                    title={track.is_favorite ? "Descurtir" : "Curtir"}
                  >
                    <HeartIcon className="h-4 w-4" filled={track.is_favorite} />
                  </button>
                )}

                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-500">
                  {fmtDuration(track.duration)}
                </span>

                {/* Menu de ações "⋮" */}
                {hasMenu(track) && (
                  <button
                    onClick={(e) => openMenu(e, track)}
                    className="shrink-0 p-1 text-zinc-400 transition-colors hover:text-white"
                    aria-label="Mais ações"
                    title="Mais ações"
                  >
                    <MoreIcon className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      {/* Menu "⋮" — bottom-sheet */}
      {menuTrack && (
        <div
          className="fixed inset-0 z-[55] flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={closeMenu}
        >
          <div
            role="menu"
            className="w-full max-w-md overflow-hidden rounded-t-3xl border-t border-white/10 bg-surface pb-[max(0.5rem,env(safe-area-inset-bottom))] shadow-2xl animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto my-2 h-1 w-10 rounded-full bg-white/20" />
            <p className="truncate px-4 pb-1 text-xs font-semibold text-zinc-400">
              {menuTrack.display_name}
            </p>
            {onPlayNext && (
              <MenuItem
                icon={<QueueIcon className="h-4 w-4 text-zinc-400" />}
                label="Tocar em seguida"
                onClick={() => {
                  onPlayNext(menuTrack);
                  closeMenu();
                }}
              />
            )}
            {onAddToPlaylist && (
              <MenuItem
                icon={<PlusIcon className="h-4 w-4 text-zinc-400" />}
                label="Adicionar à playlist"
                onClick={() => {
                  onAddToPlaylist(menuTrack);
                  closeMenu();
                }}
              />
            )}
            {onShare && (
              <MenuItem
                icon={<ShareIcon className="h-4 w-4 text-zinc-400" />}
                label="Compartilhar CD"
                onClick={() => {
                  onShare(menuTrack);
                  closeMenu();
                }}
              />
            )}
            {dl.licenseValid && (
              <MenuItem
                icon={
                  <OfflineIcon
                    className="h-4 w-4 text-zinc-400"
                    done={dl.isDownloaded(menuTrack.id)}
                  />
                }
                label={
                  dl.busy.has(menuTrack.id)
                    ? "Baixando…"
                    : dl.isDownloaded(menuTrack.id)
                      ? "Remover download"
                      : "Baixar para offline"
                }
                disabled={dl.busy.has(menuTrack.id)}
                onClick={() => {
                  toggleOffline(menuTrack);
                  closeMenu();
                }}
              />
            )}
            {onDownload && (
              <MenuItem
                icon={<DownloadIcon className="h-4 w-4 text-zinc-400" />}
                label="Baixar arquivo (MP3)"
                onClick={() => {
                  onDownload(menuTrack);
                  closeMenu();
                }}
              />
            )}
            {onRename && (
              <MenuItem
                icon={<EditIcon className="h-4 w-4 text-zinc-400" />}
                label="Renomear"
                onClick={() => {
                  onRename(menuTrack);
                  closeMenu();
                }}
              />
            )}
            {onRemove && (
              <MenuItem
                icon={<span className="w-4 text-center text-red-400">✕</span>}
                label="Remover da playlist"
                danger
                onClick={() => {
                  onRemove(menuTrack);
                  closeMenu();
                }}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left text-sm hover:bg-white/10 disabled:opacity-50 ${
        danger ? "text-red-400" : "text-zinc-100"
      }`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
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
