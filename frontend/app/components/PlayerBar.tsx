"use client";

import { useEffect, useRef, useState } from "react";
import { coverUrl, recordPlay, streamUrl, type Track } from "../lib/api";
import {
  BroomIcon,
  ChevronDownIcon,
  ClockIcon,
  MusicIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PrevIcon,
  QueueIcon,
  RepeatIcon,
  ShuffleIcon,
  VolumeIcon,
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
  onClearQueue: () => void;
  hasNext: boolean;
  hasPrev: boolean;
  // Persistência: tempo inicial ao restaurar (seek na faixa retomada) e
  // callback para o pai salvar a posição atual periodicamente.
  resumeTime?: number;
  onTime?: (seconds: number) => void;
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
  onClearQueue,
  hasNext,
  hasPrev,
  resumeTime,
  onTime,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [expanded, setExpanded] = useState(false);
  // resumeTime é aplicado uma única vez (na faixa restaurada do localStorage).
  const pendingResume = useRef<number | null>(resumeTime ?? null);
  const consumedResume = useRef(false);
  useEffect(() => {
    // Captura o resumeTime que chega logo após a montagem (restauração assíncrona),
    // desde que ainda não tenha sido aplicado a nenhuma faixa.
    if (!consumedResume.current && resumeTime && resumeTime > 0) {
      pendingResume.current = resumeTime;
    }
  }, [resumeTime]);
  // Último tempo reportado ao pai (throttle de gravação).
  const lastReported = useRef(0);

  // Volume (0..1), persistido em localStorage. Default 70%.
  const [volume, setVolume] = useState(0.7);
  // Popover de volume (usado no mobile, onde o range não cabe inline).
  const [volMenu, setVolMenu] = useState(false);
  // Sleep timer: horário-alvo (ms) ou "parar no fim da faixa".
  const [sleepUntil, setSleepUntil] = useState<number | null>(null);
  const [sleepEndOfTrack, setSleepEndOfTrack] = useState(false);
  const [sleepMenu, setSleepMenu] = useState(false);
  const [now, setNow] = useState(0);

  // Ref de isPlaying para uso dentro de timeouts (evita closure obsoleto).
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Carrega o volume salvo uma vez (só se a chave existir; senão mantém 70%).
  useEffect(() => {
    const raw = localStorage.getItem("ta_volume");
    if (raw == null) return; // primeira visita → fica em 0.7
    const saved = Number(raw);
    if (!Number.isNaN(saved) && saved >= 0 && saved <= 1) setVolume(saved);
  }, []);
  // Aplica o volume ao <audio> e persiste.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    try {
      localStorage.setItem("ta_volume", String(volume));
    } catch {
      /* ignore */
    }
  }, [volume]);

  // Sleep timer por minutos: agenda o pause e atualiza o "restam X min".
  useEffect(() => {
    if (sleepUntil == null) return;
    const fire = () => {
      audioRef.current?.pause();
      setSleepUntil(null);
      if (isPlayingRef.current) onTogglePlay();
    };
    const ms = sleepUntil - Date.now();
    if (ms <= 0) {
      fire();
      return;
    }
    const t = setTimeout(fire, ms);
    const tick = setInterval(() => setNow(Date.now()), 15000);
    return () => {
      clearTimeout(t);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleepUntil]);

  function setSleep(option: number | "track" | null) {
    setSleepMenu(false);
    if (option === null) {
      setSleepUntil(null);
      setSleepEndOfTrack(false);
    } else if (option === "track") {
      setSleepEndOfTrack(true);
      setSleepUntil(null);
    } else {
      setSleepEndOfTrack(false);
      setNow(Date.now());
      setSleepUntil(Date.now() + option * 60000);
    }
  }

  const sleepActive = sleepUntil != null || sleepEndOfTrack;
  const sleepRemaining =
    sleepUntil != null ? Math.max(0, Math.ceil((sleepUntil - now) / 60000)) : null;

  // Quando a faixa termina: sleep "fim da faixa" para; repeat-one reinicia;
  // senão delega ao pai (próxima da fila).
  function handleEnded() {
    const audio = audioRef.current;
    if (sleepEndOfTrack) {
      setSleepEndOfTrack(false);
      if (isPlayingRef.current) onTogglePlay();
      return;
    }
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
    const resume = pendingResume.current;
    pendingResume.current = null; // só vale para a 1ª faixa (restaurada)
    consumedResume.current = true;
    setCurrent(resume ?? 0);
    setDuration(0);
    if (resume && resume > 0) {
      // Aplica o seek assim que os metadados carregarem.
      const onMeta = () => {
        audio.currentTime = resume;
        audio.removeEventListener("loadedmetadata", onMeta);
      };
      audio.addEventListener("loadedmetadata", onMeta);
    }
    if (isPlaying) audio.play().catch(() => {});
    // Não registra play em faixa apenas restaurada (pausada); só ao tocar de fato.
    if (resume == null) recordPlay(track.id);
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
  const fillPct = totalDuration > 0 ? (current / totalDuration) * 100 : 0;
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
        className="slider-visible slider-fill flex-1"
        style={{ ["--fill" as string]: `${fillPct}%` }}
        aria-label="Progresso"
      />
      <span className="w-10 text-xs tabular-nums text-zinc-400">{fmt(totalDuration)}</span>
    </div>
  );

  return (
    <>
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => {
          const t = e.currentTarget.currentTime;
          setCurrent(t);
          // Reporta a posição ao pai a cada ~5s (para salvar no localStorage).
          if (onTime && Math.abs(t - lastReported.current) >= 5) {
            lastReported.current = t;
            onTime(t);
          }
        }}
        onPause={() => onTime?.(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* ----- Mini barra (rodapé) ----- */}
      {/* lg:left-64 = não cobre o sidebar (Admin/Sair ficam clicáveis no desktop). */}
      <footer className="fixed inset-x-0 bottom-[57px] z-30 border-t border-white/10 bg-black/80 backdrop-blur-xl lg:bottom-0 lg:left-64 lg:pb-[env(safe-area-inset-bottom)]">
        <div className="flex w-full items-center gap-3 px-4 py-2.5">
          {/* Capa + título: abre o Now Playing */}
          <button
            onClick={() => setExpanded(true)}
            className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
          </button>

          {/* Volume — desktop: range inline; mobile: ícone abre popover */}
          <div className="relative flex items-center">
            <button
              type="button"
              onClick={() => setVolMenu((v) => !v)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 hover:text-white"
              aria-label="Volume"
              title="Volume"
            >
              <VolumeIcon muted={volume === 0} className="h-5 w-5" />
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              className="slider-visible slider-fill hidden w-24 lg:block"
              style={{ ["--fill" as string]: `${volume * 100}%` }}
              aria-label="Volume"
            />
            {volMenu && (
              <>
                {/* backdrop pra fechar ao tocar fora (mobile) */}
                <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setVolMenu(false)} />
                <div className="absolute bottom-12 right-0 z-50 rounded-xl border border-white/10 bg-zinc-900 p-3 shadow-2xl lg:hidden">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="slider-visible slider-fill w-40"
                    style={{ ["--fill" as string]: `${volume * 100}%` }}
                    aria-label="Volume"
                  />
                </div>
              </>
            )}
          </div>

          {/* Limpar fila (vassoura) */}
          <button
            type="button"
            onClick={onClearQueue}
            className="flex h-10 w-10 items-center justify-center rounded-full text-zinc-300 hover:text-white"
            aria-label="Limpar fila"
            title="Limpar fila"
          >
            <BroomIcon className="h-5 w-5" />
          </button>

          {/* Fila */}
          <button
            type="button"
            onClick={onOpenQueue}
            className="hidden h-10 w-10 items-center justify-center rounded-full text-zinc-300 hover:text-white sm:flex"
            aria-label="Fila"
            title="Fila"
          >
            <QueueIcon className="h-5 w-5" />
          </button>

          {/* Play/Pause */}
          <button
            type="button"
            onClick={onTogglePlay}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black"
            aria-label={isPlaying ? "Pausar" : "Tocar"}
          >
            {isPlaying ? (
              <PauseIcon className="h-5 w-5" />
            ) : (
              <PlayIcon className="ml-0.5 h-5 w-5" />
            )}
          </button>
        </div>
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

            {/* Volume + sleep timer */}
            <div className="flex items-center gap-4">
              <div className="flex flex-1 items-center gap-2">
                <VolumeIcon muted={volume === 0} className="h-5 w-5 shrink-0 text-white/70" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="slider-visible slider-fill flex-1"
                  style={{ ["--fill" as string]: `${volume * 100}%` }}
                  aria-label="Volume"
                />
              </div>
              <div className="relative">
                <button
                  onClick={() => setSleepMenu((m) => !m)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    sleepActive ? "bg-accent text-black" : "bg-white/10 text-white/80"
                  }`}
                  aria-label="Sleep timer"
                  title="Sleep timer"
                >
                  <ClockIcon className="h-4 w-4" />
                  {sleepActive
                    ? sleepEndOfTrack
                      ? "fim"
                      : `${sleepRemaining}m`
                    : "Timer"}
                </button>
                {sleepMenu && (
                  <div className="absolute bottom-full right-0 mb-2 w-44 overflow-hidden rounded-xl border border-white/10 bg-surface shadow-2xl">
                    {[
                      { label: "15 minutos", value: 15 as const },
                      { label: "30 minutos", value: 30 as const },
                      { label: "1 hora", value: 60 as const },
                      { label: "Fim da faixa", value: "track" as const },
                    ].map((o) => (
                      <button
                        key={o.label}
                        onClick={() => setSleep(o.value)}
                        className="block w-full px-4 py-2.5 text-left text-sm hover:bg-white/10"
                      >
                        {o.label}
                      </button>
                    ))}
                    {sleepActive && (
                      <button
                        onClick={() => setSleep(null)}
                        className="block w-full border-t border-white/10 px-4 py-2.5 text-left text-sm text-red-400 hover:bg-white/10"
                      >
                        Desligar timer
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="h-[max(1.5rem,env(safe-area-inset-bottom))]" />
        </div>
      )}
    </>
  );
}
