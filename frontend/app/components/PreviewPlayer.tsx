"use client";

import { useEffect, useRef, useState } from "react";
import { previewUrl, type PublicTrack } from "../lib/api";
import { PauseIcon, PlayIcon } from "./icons";

function fmt(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Tracklist pública com prévia de ~30s por faixa (sem login). */
export default function PreviewPlayer({ tracks }: { tracks: PublicTrack[] }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);

  useEffect(() => {
    const audio = audioRef.current;
    return () => {
      audio?.pause();
    };
  }, []);

  function toggle(id: number) {
    const audio = audioRef.current;
    if (!audio) return;
    if (playingId === id) {
      audio.pause();
      setPlayingId(null);
      return;
    }
    audio.src = previewUrl(id);
    audio.play().catch(() => {});
    setPlayingId(id);
  }

  return (
    <div>
      <audio ref={audioRef} onEnded={() => setPlayingId(null)} preload="none" />
      <ul className="space-y-0.5">
        {tracks.map((t, i) => {
          const active = playingId === t.id;
          return (
            <li key={t.id}>
              <button
                onClick={() => toggle(t.id)}
                className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                  active ? "bg-white/10" : "hover:bg-white/5"
                }`}
              >
                <span className="flex w-6 shrink-0 items-center justify-center text-sm text-zinc-500">
                  {active ? (
                    <PauseIcon className="h-4 w-4 text-accent" />
                  ) : (
                    <>
                      <span className="group-hover:hidden">{i + 1}</span>
                      <PlayIcon className="ml-0.5 hidden h-3.5 w-3.5 text-white group-hover:block" />
                    </>
                  )}
                </span>
                <span
                  className={`min-w-0 flex-1 truncate ${active ? "font-semibold text-accent" : ""}`}
                >
                  {t.display_name}
                </span>
                <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                  prévia 30s
                </span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-500">
                  {fmt(t.duration)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
