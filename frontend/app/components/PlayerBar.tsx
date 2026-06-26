"use client";

import { useEffect, useRef, useState } from "react";
import { coverUrl, recordPlay, streamUrl, type Track } from "../lib/api";
import {
  ChevronDownIcon,
  MusicIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  QueueIcon,
  RepeatIcon,
  ShuffleIcon,
} from "./icons";

interface Props {
  track: Track | null;
  bandName: string | null;
  bandId: number | null;
  hasCover: boolean;
  isPlaying: boolean;
  shuffle: boolean;
  repeat: "off" | "all" | "one";
  onToggleShuffle: () => void;
  onCycleRepeat: () => void;
  onTogglePlay: () => void;
  onNext: () => void;
  onPrev: () => void;
  onEnded: () => void;
  onOpenQueue: () => void;
  hasNext: boolean;
  hasPrev: boolean;
}

function fmt(s: number): string {
  if (!isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${r.toString().padStart(2, "0")}`;
}

// Gradiente determinístico (capa "fake" da banda) — igual ao BandGrid.
const GRADIENTS = [
  "from-rose-500 to-orange-500",
  "from-accent to-emerald-700",
  "from-indigo-500 to-purple-600",
  "from-sky-500 to-blue-700",
  "from-fuchsia-500 to-pink-600",
  "from-amber-400 to-red-500",
  "from-teal-400 to-cyan-600",
];
function gradientFor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return GRADIENTS[h % GRADIENTS.length];
}

export default function PlayerBar({
  track,
  bandName,
  bandId,
  hasCover,
  isPlaying,
  shuffle,
  repeat,
  onToggleShuffle,
  onCycleRepeat,
  onTogglePlay,
  onNext,
  onPrev,
  onEnded,
  onOpenQueue,
  hasNext,
  hasPrev,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);

  // Quando a faixa termina: repeat-one reinicia a mesma; senão delega ao pai.
  function handleEnded() {
    const audio = audioRef.current;
    if (repeat === "one" && audio) {
      audio.currentTime = 0;
      audio.play().catch(() => {});
      return;
    }
    onEnded();
  }

  // Troca de faixa → novo src (dispara o streaming).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    audio.src = streamUrl(track.id);
    audio.load();
    setCurrent(0);
    setDuration(0);
    if (isPlaying) audio.play().catch(() => {});
    // Registra a reprodução para "Tocadas recentemente" (falha silenciosa).
    recordPlay(track.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id]);

  // Play/pause vindo do pai.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    if (isPlaying) audio.play().catch(() => {});
    else audio.pause();
  }, [isPlaying, track]);

  // MediaSession: controles na tela de bloqueio/notificação do celular.
  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    if (!track) return;
    const artwork =
      hasCover && bandId != null
        ? [{ src: coverUrl(bandId), sizes: "512x512", type: "image/jpeg" }]
        : undefined;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.display_name,
      artist: bandName ?? "TOQUE AGORA",
      album: bandName ?? "",
      artwork,
    });
    navigator.mediaSession.setActionHandler("play", onTogglePlay);
    navigator.mediaSession.setActionHandler("pause", onTogglePlay);
    navigator.mediaSession.setActionHandler("nexttrack", onNext);
    navigator.mediaSession.setActionHandler("previoustrack", onPrev);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, bandName, hasCover, bandId]);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = isPlaying ? "playing" : "paused";
  }, [isPlaying]);

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current;
    if (!audio) return;
    const t = Number(e.target.value);
    audio.currentTime = t; // dispara Range request
    setCurrent(t);
  }

  if (!track) {
    return (
      <audio ref={audioRef} preload="metadata" />
    );
  }

  const coverSeed = bandName ?? track.display_name;
  const grad = gradientFor(coverSeed);
  const coverImg = hasCover && bandId != null ? coverUrl(bandId) : null;

  // Barra de progresso reutilizável.
  // Duração total: a do <audio> (precisa) ou a do banco (ID3) como fallback imediato.
  const totalDuration = duration || track.duration || 0;
  const progress = (
    <div className="flex w-full items-center gap-2">
      <span className="w-10 text-right text-xs tabular-nums text-zinc-400">{fmt(current)}</span>
      <input
        type="range"
        min={0}
        max={totalDuration || 0}
        step={0.1}
        value={current}
        onChange={seek}
        disabled={!duration}
        className="flex-1 bg-white/20 accent-accent"
        aria-label="Progresso"
      />
      <span className="w-10 text-xs tabular-nums text-zinc-400">{fmt(totalDuration)}</span>
    </div>
  );

  return (
    <>
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* ----- Mini barra (rodapé) ----- */}
      <footer className="fixed inset-x-0 bottom-[57px] z-30 border-t border-white/10 bg-black/80 backdrop-blur-xl lg:bottom-0 lg:pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={() => setExpanded(true)}
          className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
          aria-label="Abrir player"
        >
          <div className={`relative flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br ${grad}`}>
            {coverImg ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={coverImg} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <MusicIcon className="h-5 w-5 text-white/90" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{track.display_name}</p>
            <p className="truncate text-xs text-zinc-400">{bandName ?? "—"}</p>
          </div>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onOpenQueue();
            }}
            className="hidden h-10 w-10 items-center justify-center rounded-full text-zinc-300 hover:text-white sm:flex"
            aria-label="Fila"
            title="Fila"
          >
            <QueueIcon className="h-5 w-5" />
          </span>
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation();
              onTogglePlay();
            }}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-black"
          >
            {isPlaying ? (
              <PauseIcon className="h-5 w-5" />
            ) : (
              <PlayIcon className="ml-0.5 h-5 w-5" />
            )}
          </span>
        </button>
        {/* mini progress fininho */}
        <div className="h-0.5 w-full bg-white/10">
          <div
            className="h-full bg-accent"
            style={{ width: duration ? `${(current / duration) * 100}%` : "0%" }}
          />
        </div>
      </footer>

      {/* ----- Now Playing tela cheia (estilo Spotify mobile) ----- */}
      {expanded && (
        <div className={`fixed inset-0 z-50 flex flex-col bg-gradient-to-b ${grad} to-black/95`}>
          <div className="flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
            <button
              onClick={() => setExpanded(false)}
              aria-label="Minimizar"
              className="rounded-full p-1 active:scale-90"
            >
              <ChevronDownIcon className="h-7 w-7" />
            </button>
            <p className="truncate px-3 text-sm font-semibold">{bandName ?? "Tocando agora"}</p>
            <button
              onClick={onOpenQueue}
              aria-label="Fila"
              title="Fila"
              className="rounded-full p-1 active:scale-90"
            >
              <QueueIcon className="h-6 w-6" />
            </button>
          </div>

          <div className="flex flex-1 flex-col justify-center gap-6 px-7">
            {/* Capa grande */}
            <div className="mx-auto flex aspect-square w-full max-w-[340px] items-center justify-center overflow-hidden rounded-2xl bg-black/25 shadow-2xl">
              {coverImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverImg} alt={bandName ?? ""} className="h-full w-full object-cover" />
              ) : (
                <MusicIcon className="h-24 w-24 text-white/85" />
              )}
            </div>

            {/* Título + artista */}
            <div>
              <h2 className="truncate text-2xl font-black">{track.display_name}</h2>
              <p className="truncate text-zinc-300">{bandName ?? "—"}</p>
            </div>

            {progress}

            {/* Controles */}
            <div className="flex items-center justify-between px-1">
              <button
                onClick={onToggleShuffle}
                className={`relative p-2 transition-colors ${shuffle ? "text-accent" : "text-white/60"}`}
                aria-label="Aleatório"
                aria-pressed={shuffle}
                title="Aleatório"
              >
                <ShuffleIcon className="h-5 w-5" />
                {shuffle && <span className="absolute inset-x-2 -bottom-0.5 mx-auto h-1 w-1 rounded-full bg-accent" />}
              </button>
              <button
                onClick={onPrev}
                disabled={!hasPrev}
                className="p-2 text-white transition-opacity disabled:opacity-30"
                aria-label="Anterior"
              >
                <PrevIcon className="h-8 w-8" />
              </button>
              <button
                onClick={onTogglePlay}
                className="flex h-16 w-16 items-center justify-center rounded-full bg-white text-black shadow-xl transition-transform active:scale-95"
                aria-label={isPlaying ? "Pausar" : "Tocar"}
              >
                {isPlaying ? (
                  <PauseIcon className="h-7 w-7" />
                ) : (
                  <PlayIcon className="ml-1 h-7 w-7" />
                )}
              </button>
              <button
                onClick={onNext}
                disabled={!hasNext}
                className="p-2 text-white transition-opacity disabled:opacity-30"
                aria-label="Próxima"
              >
                <NextIcon className="h-8 w-8" />
              </button>
              <button
                onClick={onCycleRepeat}
                className={`relative p-2 transition-colors ${repeat !== "off" ? "text-accent" : "text-white/60"}`}
                aria-label="Repetir"
                title={
                  repeat === "one"
                    ? "Repetir a faixa"
                    : repeat === "all"
                      ? "Repetir tudo"
                      : "Repetir"
                }
              >
                <RepeatIcon className="h-5 w-5" />
                {repeat === "one" && (
                  <span className="absolute -right-0 -top-0 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-accent text-[8px] font-black text-black">
                    1
                  </span>
                )}
                {repeat === "all" && (
                  <span className="absolute inset-x-2 -bottom-0.5 mx-auto h-1 w-1 rounded-full bg-accent" />
                )}
              </button>
            </div>
          </div>
          <div className="h-[max(1.5rem,env(safe-area-inset-bottom))]" />
        </div>
      )}
    </>
  );
}
