"use client";

import { useEffect, useRef, useState } from "react";
import { coverUrl, recordPlay, streamUrl, type Track } from "../lib/api";
import { gradientFor } from "../lib/covers";
import { useDownloads } from "../lib/downloads";
import Marquee from "./Marquee";
import {
  BroomIcon,
  CarIcon,
  ChevronDownIcon,
  ClockIcon,
  EqIcon,
  HeartIcon,
  MusicIcon,
  NextIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  PrevIcon,
  QueueIcon,
  RepeatIcon,
  ShuffleIcon,
  VolumeIcon,
} from "./icons";

// Bandas do equalizer (Hz) e presets (ganho em dB por banda).
const EQ_BANDS = [60, 250, 1000, 4000, 12000];
const EQ_PRESETS: Record<string, number[]> = {
  Normal: [0, 0, 0, 0, 0],
  Grave: [6, 4, 1, 0, -1],
  Vocal: [-2, 0, 4, 3, 0],
  Agudo: [-2, -1, 0, 4, 6],
  Festa: [5, 2, 0, 3, 5],
};

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
  // Nome da próxima faixa na fila (mostrado como "A seguir" no mini-player).
  nextTitle?: string | null;
  // Ações sobre a faixa atual (Now Playing): curtir e adicionar à playlist.
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  onAddToPlaylist?: () => void;
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

// Duração (s) do fade-in/fade-out do crossfade.
const CROSSFADE_SEC = 3;

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
  nextTitle,
  isFavorite,
  onToggleFavorite,
  onAddToPlaylist,
  resumeTime,
  onTime,
}: Props) {
  const { getOfflineUrl } = useDownloads();
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
  // Crossfade: fade-out no fim da faixa + fade-in no começo da próxima.
  // Default OFF (DVD ao vivo tem áudio contínuo — fade cortaria aplausos/fala).
  const [crossfade, setCrossfade] = useState(false);
  // Sleep timer: horário-alvo (ms) ou "parar no fim da faixa".
  const [sleepUntil, setSleepUntil] = useState<number | null>(null);
  const [sleepEndOfTrack, setSleepEndOfTrack] = useState(false);
  const [sleepMenu, setSleepMenu] = useState(false);
  const [now, setNow] = useState(0);
  // Velocidade de reprodução (1 = normal), persistida.
  const [speed, setSpeed] = useState(1);
  const [speedMenu, setSpeedMenu] = useState(false);
  // Modo carro (botões grandes) e Equalizer.
  const [carMode, setCarMode] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const [eqGains, setEqGains] = useState<number[]>(() => EQ_BANDS.map(() => 0));
  // Grafo Web Audio (criado sob demanda, na 1ª vez que o EQ é usado).
  const audioCtxRef = useRef<AudioContext | null>(null);
  const eqFiltersRef = useRef<BiquadFilterNode[]>([]);
  const eqBuiltRef = useRef(false);

  // Gestos de toque no Now Playing: swipe p/ baixo fecha; horizontal troca faixa.
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
  }
  function onTouchEnd(e: React.TouchEvent) {
    const s = touchStart.current;
    touchStart.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ay > 80 && ay > ax && dy > 0) {
      setExpanded(false); // arrastar para baixo fecha
    } else if (ax > 60 && ax > ay) {
      if (dx < 0 && hasNext) onNext();
      else if (dx > 0 && hasPrev) onPrev();
    }
  }

  // Gestos no mini-player: swipe ↑ abre o Now Playing; ← → troca de faixa.
  const miniTouch = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  function onMiniTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    miniTouch.current = { x: t.clientX, y: t.clientY };
  }
  function onMiniTouchEnd(e: React.TouchEvent) {
    const s = miniTouch.current;
    miniTouch.current = null;
    if (!s) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (ay > 50 && ay > ax && dy < 0) {
      swipedRef.current = true;
      setExpanded(true);
    } else if (ax > 60 && ax > ay) {
      swipedRef.current = true;
      if (dx < 0 && hasNext) onNext();
      else if (dx > 0 && hasPrev) onPrev();
    }
    if (swipedRef.current) setTimeout(() => (swipedRef.current = false), 400);
  }

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

  // Carrega a velocidade salva uma vez.
  useEffect(() => {
    const raw = Number(localStorage.getItem("ta_speed"));
    if (raw >= 0.5 && raw <= 2) setSpeed(raw);
  }, []);
  // Aplica a velocidade ao <audio> e persiste (playbackRate reseta ao trocar
  // de src, então também reaplicamos no efeito de troca de faixa e no canplay).
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
    try {
      localStorage.setItem("ta_speed", String(speed));
    } catch {
      /* ignore */
    }
  }, [speed]);

  // ---- Equalizer (Web Audio) ----
  // Carrega os ganhos salvos uma vez.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("ta_eq");
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length === EQ_BANDS.length) setEqGains(arr);
      }
    } catch {
      /* ignore */
    }
  }, []);

  // Cria o grafo (source → filtros peaking → destino) na 1ª vez que o EQ é usado.
  // O MediaElementSource só pode ser criado UMA vez por elemento <audio>.
  function buildEqGraph() {
    const audio = audioRef.current;
    if (eqBuiltRef.current || !audio) return;
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(audio);
      const filters = EQ_BANDS.map((freq, i) => {
        const f = ctx.createBiquadFilter();
        f.type = "peaking";
        f.frequency.value = freq;
        f.Q.value = 1;
        f.gain.value = eqGains[i] ?? 0;
        return f;
      });
      // Encadeia source → f0 → f1 → ... → destino.
      let node: AudioNode = source;
      for (const f of filters) {
        node.connect(f);
        node = f;
      }
      node.connect(ctx.destination);
      audioCtxRef.current = ctx;
      eqFiltersRef.current = filters;
      eqBuiltRef.current = true;
    } catch {
      // Se falhar (ex.: fonte cross-origin), o áudio segue tocando normalmente.
    }
  }

  function applyEqGains(gains: number[]) {
    setEqGains(gains);
    try {
      localStorage.setItem("ta_eq", JSON.stringify(gains));
    } catch {
      /* ignore */
    }
    eqFiltersRef.current.forEach((f, i) => {
      f.gain.value = gains[i] ?? 0;
    });
  }

  function openEq() {
    buildEqGraph();
    // AudioContext começa "suspended"; retoma no gesto do usuário.
    audioCtxRef.current?.resume().catch(() => {});
    // Garante que os filtros reflitam os ganhos atuais.
    eqFiltersRef.current.forEach((f, i) => {
      f.gain.value = eqGains[i] ?? 0;
    });
    setEqOpen(true);
  }

  // Carrega e persiste o crossfade.
  useEffect(() => {
    setCrossfade(localStorage.getItem("ta_crossfade") === "1");
  }, []);
  function toggleCrossfade() {
    setCrossfade((c) => {
      const next = !c;
      try {
        localStorage.setItem("ta_crossfade", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      // Ao desligar, restaura o volume cheio imediatamente.
      if (!next && audioRef.current) audioRef.current.volume = volume;
      return next;
    });
  }

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

  // Troca de faixa → novo src. Usa o arquivo OFFLINE decifrado se a faixa foi
  // baixada (toca sem rede); senão, streaming. É assíncrono por causa da
  // decifragem, então guardamos/revogamos o objectURL ao trocar.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !track) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    const resume = pendingResume.current;
    pendingResume.current = null; // só vale para a 1ª faixa (restaurada)
    consumedResume.current = true;
    setCurrent(resume ?? 0);
    setDuration(0);

    (async () => {
      const offline = await getOfflineUrl(track.id).catch(() => null);
      if (cancelled) {
        if (offline) URL.revokeObjectURL(offline);
        return;
      }
      objectUrl = offline;
      audio.src = offline ?? streamUrl(track.id);
      audio.load();
      audio.playbackRate = speed; // playbackRate reseta ao trocar o src
      audio.volume = crossfade ? 0 : volume;
      if (resume && resume > 0) {
        const onMeta = () => {
          audio.currentTime = resume;
          audio.removeEventListener("loadedmetadata", onMeta);
        };
        audio.addEventListener("loadedmetadata", onMeta);
      }
      if (isPlaying) audio.play().catch(() => {});
      // Não registra play em faixa restaurada (pausada) nem offline.
      if (resume == null && offline == null) recordPlay(track.id);
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
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
          const audio = e.currentTarget;
          const t = audio.currentTime;
          setCurrent(t);
          // Crossfade: fade-in nos 1ºs segundos e fade-out nos últimos.
          if (crossfade && audio.duration && isFinite(audio.duration)) {
            const factor = Math.max(
              0,
              Math.min(1, t / CROSSFADE_SEC, (audio.duration - t) / CROSSFADE_SEC),
            );
            audio.volume = volume * factor;
          }
          // Reporta a posição ao pai a cada ~5s (para salvar no localStorage).
          if (onTime && Math.abs(t - lastReported.current) >= 5) {
            lastReported.current = t;
            onTime(t);
          }
        }}
        onPause={() => onTime?.(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onCanPlay={(e) => {
          // Rede da correção do "rádio não inicia sozinho": ao trocar a fila
          // (ex.: iniciar um rádio), o play() disparado logo após o load() pode
          // acontecer antes do áudio estar pronto. Quando o áudio fica pronto
          // (canplay) e a intenção é tocar, garantimos o play aqui.
          e.currentTarget.playbackRate = speed; // garante a velocidade após carregar
          // Se o EQ está ativo, garante o AudioContext rodando (iOS suspende em background).
          if (audioCtxRef.current?.state === "suspended") {
            audioCtxRef.current.resume().catch(() => {});
          }
          if (isPlaying && e.currentTarget.paused) {
            e.currentTarget.play().catch(() => {});
          }
        }}
        onEnded={handleEnded}
        preload="metadata"
      />

      {/* ----- Mini barra (rodapé) ----- */}
      {/* lg:left-64 = não cobre o sidebar (Admin/Sair ficam clicáveis no desktop). */}
      <footer className="fixed inset-x-0 bottom-[57px] z-30 border-t border-white/10 bg-black/90 backdrop-blur-xl lg:bottom-0 lg:left-64 lg:pb-[env(safe-area-inset-bottom)]">
        <div className="flex w-full items-center gap-3 px-4 py-2.5">
          {/* Capa + título: abre o Now Playing (toque) · swipe ↑ / ← → (gestos) */}
          <button
            onClick={() => {
              if (swipedRef.current) return; // ignora o clique após um swipe
              setExpanded(true);
            }}
            onTouchStart={onMiniTouchStart}
            onTouchEnd={onMiniTouchEnd}
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
              <Marquee text={track.display_name} active className="text-sm font-semibold" />
              <Marquee text={bandName ?? "—"} active className="text-xs text-zinc-400" />
              {nextTitle && (
                <p className="truncate text-[10px] text-zinc-500">
                  A seguir: {nextTitle}
                </p>
              )}
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
            <Marquee
              text={bandName ?? "Tocando agora"}
              active
              className="min-w-0 flex-1 px-3 text-center text-sm font-semibold"
            />
            <div className="flex items-center gap-1">
              <button
                onClick={openEq}
                aria-label="Equalizador"
                title="Equalizador"
                className="rounded-full p-1 active:scale-90"
              >
                <EqIcon className="h-6 w-6" />
              </button>
              <button
                onClick={() => setCarMode(true)}
                aria-label="Modo carro"
                title="Modo carro"
                className="rounded-full p-1 active:scale-90"
              >
                <CarIcon className="h-6 w-6" />
              </button>
              <button
                onClick={onOpenQueue}
                aria-label="Fila"
                title="Fila"
                className="rounded-full p-1 active:scale-90"
              >
                <QueueIcon className="h-6 w-6" />
              </button>
            </div>
          </div>

          <div className="flex flex-1 flex-col justify-center gap-6 px-7">
            {/* Capa grande — área de gestos (swipe ↓ fecha, ← → troca faixa) */}
            <div
              onTouchStart={onTouchStart}
              onTouchEnd={onTouchEnd}
              className="mx-auto flex aspect-square w-full max-w-[340px] items-center justify-center overflow-hidden rounded-2xl bg-black/25 shadow-2xl"
            >
              {coverImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverImg} alt={bandName ?? ""} className="h-full w-full object-cover" />
              ) : (
                <MusicIcon className="h-24 w-24 text-white/85" />
              )}
            </div>

            {/* Título + artista + ações (curtir / adicionar à playlist) */}
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <Marquee text={track.display_name} active className="text-2xl font-black" />
                <Marquee text={bandName ?? "—"} active className="text-zinc-300" />
              </div>
              {onToggleFavorite && (
                <button
                  onClick={onToggleFavorite}
                  className={`shrink-0 p-2 transition-colors ${
                    isFavorite ? "text-accent" : "text-white/70 hover:text-white"
                  }`}
                  aria-label={isFavorite ? "Descurtir" : "Curtir"}
                  aria-pressed={isFavorite}
                  title={isFavorite ? "Descurtir" : "Curtir"}
                >
                  <HeartIcon className="h-6 w-6" filled={isFavorite} />
                </button>
              )}
              {onAddToPlaylist && (
                <button
                  onClick={onAddToPlaylist}
                  className="shrink-0 p-2 text-white/70 transition-colors hover:text-white"
                  aria-label="Adicionar à playlist"
                  title="Adicionar à playlist"
                >
                  <PlusIcon className="h-6 w-6" />
                </button>
              )}
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

            {/* Volume + controles (crossfade / velocidade / timer) */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
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
              <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={toggleCrossfade}
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  crossfade ? "bg-accent text-black" : "bg-white/10 text-white/80"
                }`}
                aria-pressed={crossfade}
                title="Crossfade (transição com fade entre faixas)"
              >
                Crossfade
              </button>
              {/* Velocidade de reprodução */}
              <div className="relative">
                <button
                  onClick={() => setSpeedMenu((m) => !m)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                    speed !== 1 ? "bg-accent text-black" : "bg-white/10 text-white/80"
                  }`}
                  aria-label="Velocidade de reprodução"
                  title="Velocidade"
                >
                  {speed}x
                </button>
                {speedMenu && (
                  <div className="absolute bottom-full right-0 mb-2 w-28 overflow-hidden rounded-xl border border-white/10 bg-surface shadow-2xl">
                    {[0.75, 1, 1.25, 1.5, 2].map((v) => (
                      <button
                        key={v}
                        onClick={() => {
                          setSpeed(v);
                          setSpeedMenu(false);
                        }}
                        className={`block w-full px-4 py-2.5 text-left text-sm hover:bg-white/10 ${
                          v === speed ? "text-accent" : ""
                        }`}
                      >
                        {v}x{v === 1 ? " (normal)" : ""}
                      </button>
                    ))}
                  </div>
                )}
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
          </div>
          <div className="h-[max(1.5rem,env(safe-area-inset-bottom))]" />
        </div>
      )}

      {/* ----- Modo carro (botões grandes, alto contraste) ----- */}
      {carMode && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-black text-white">
          <div className="flex items-center justify-between px-6 pt-[max(1rem,env(safe-area-inset-top))]">
            <span className="text-sm font-semibold uppercase tracking-wider text-zinc-500">
              Modo carro
            </span>
            <button
              onClick={() => setCarMode(false)}
              className="rounded-full bg-white/10 px-6 py-3 text-base font-bold active:scale-95"
            >
              Sair
            </button>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center gap-10 px-6">
            <div className="h-44 w-44 overflow-hidden rounded-3xl bg-white/10 shadow-2xl">
              {coverImg ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={coverImg} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${grad}`}>
                  <MusicIcon className="h-20 w-20 text-white/85" />
                </div>
              )}
            </div>
            <div className="w-full max-w-md text-center">
              <Marquee text={track.display_name} active className="text-3xl font-black" />
              <Marquee text={bandName ?? "—"} active className="mt-2 text-xl text-zinc-400" />
            </div>
            <div className="flex w-full max-w-md items-center justify-center gap-6">
              <button
                onClick={onPrev}
                disabled={!hasPrev}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 active:scale-95 disabled:opacity-30"
                aria-label="Anterior"
              >
                <PrevIcon className="h-10 w-10" />
              </button>
              <button
                onClick={onTogglePlay}
                className="flex h-28 w-28 items-center justify-center rounded-full bg-white text-black shadow-xl active:scale-95"
                aria-label={isPlaying ? "Pausar" : "Tocar"}
              >
                {isPlaying ? (
                  <PauseIcon className="h-14 w-14" />
                ) : (
                  <PlayIcon className="ml-2 h-14 w-14" />
                )}
              </button>
              <button
                onClick={onNext}
                disabled={!hasNext}
                className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 active:scale-95 disabled:opacity-30"
                aria-label="Próxima"
              >
                <NextIcon className="h-10 w-10" />
              </button>
            </div>
          </div>
          <div className="h-[max(1.5rem,env(safe-area-inset-bottom))]" />
        </div>
      )}

      {/* ----- Equalizador (bottom sheet) ----- */}
      {eqOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setEqOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Equalizador"
            className="w-full max-w-md space-y-4 rounded-t-3xl border-t border-white/10 bg-surface p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">Equalizador</h2>
              <button
                onClick={() => setEqOpen(false)}
                className="text-zinc-400 hover:text-white"
                aria-label="Fechar"
              >
                ✕
              </button>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(EQ_PRESETS).map(([name, gains]) => {
                const on = gains.every((g, i) => g === eqGains[i]);
                return (
                  <button
                    key={name}
                    onClick={() => applyEqGains(gains)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      on ? "bg-accent text-black" : "bg-white/10 text-zinc-200 hover:bg-white/20"
                    }`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>

            {/* Bandas */}
            <div className="space-y-3">
              {EQ_BANDS.map((freq, i) => (
                <div key={freq} className="flex items-center gap-3">
                  <span className="w-11 shrink-0 text-right text-xs tabular-nums text-zinc-400">
                    {freq >= 1000 ? `${freq / 1000}k` : freq}
                  </span>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={eqGains[i]}
                    onChange={(e) => {
                      const next = [...eqGains];
                      next[i] = Number(e.target.value);
                      applyEqGains(next);
                    }}
                    className="slider-visible slider-fill flex-1"
                    style={{ ["--fill" as string]: `${((eqGains[i] + 12) / 24) * 100}%` }}
                    aria-label={`Banda ${freq} Hz`}
                  />
                  <span className="w-11 shrink-0 text-xs tabular-nums text-zinc-400">
                    {eqGains[i] > 0 ? "+" : ""}
                    {eqGains[i]}dB
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
