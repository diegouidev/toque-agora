"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  fetchPublicPlaylist,
  previewUrl,
  type PublicPlaylist,
} from "../../lib/api";
import { PauseIcon, PlayIcon } from "../../components/icons";

function fmt(sec: number): string {
  if (!sec) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function PublicPlaylistPage({
  params,
}: {
  params: { token: string };
}) {
  const { token } = params;
  const [pl, setPl] = useState<PublicPlaylist | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playingId, setPlayingId] = useState<number | null>(null);

  useEffect(() => {
    fetchPublicPlaylist(token)
      .then(setPl)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    const audio = audioRef.current;
    return () => audio?.pause();
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
    <main className="min-h-screen pb-16">
      <header className="sticky top-0 z-20 border-b border-white/5 bg-base/80 px-4 py-3 backdrop-blur sm:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link href="/" className="font-display text-lg font-black uppercase tracking-tight">
            Toque <span className="text-accent">Agora</span>
          </Link>
          <Link
            href="/"
            className="rounded-full bg-accent px-4 py-1.5 text-xs font-bold text-black"
          >
            Assinar
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <audio ref={audioRef} onEnded={() => setPlayingId(null)} preload="none" />

        {loading ? (
          <p className="py-16 text-center text-sm text-zinc-500">Carregando…</p>
        ) : error || !pl ? (
          <p className="py-16 text-center text-sm text-zinc-500">
            Playlist não encontrada ou link desativado.
          </p>
        ) : (
          <>
            <div className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Playlist
              </p>
              <h1 className="font-display text-3xl font-black">{pl.name}</h1>
              <p className="mt-1 text-sm text-zinc-400">
                {pl.owner_name ? `por ${pl.owner_name} · ` : ""}
                {pl.track_count} faixas
              </p>
            </div>

            <ul className="space-y-0.5">
              {pl.tracks.map((t, i) => {
                const active = playingId === t.id;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => t.preview && toggle(t.id)}
                      disabled={!t.preview}
                      className={`group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                        active ? "bg-white/10" : "hover:bg-white/5"
                      } ${t.preview ? "" : "cursor-default opacity-70"}`}
                    >
                      <span className="flex w-6 shrink-0 items-center justify-center text-sm text-zinc-500">
                        {active ? (
                          <PauseIcon className="h-4 w-4 text-accent" />
                        ) : t.preview ? (
                          <>
                            <span className="group-hover:hidden">{i + 1}</span>
                            <PlayIcon className="ml-0.5 hidden h-3.5 w-3.5 text-white group-hover:block" />
                          </>
                        ) : (
                          <span>{i + 1}</span>
                        )}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate ${active ? "font-semibold text-accent" : ""}`}
                        >
                          {t.display_name}
                        </span>
                        {t.band_name && (
                          <span className="block truncate text-xs text-zinc-500">
                            {t.band_name}
                          </span>
                        )}
                      </span>
                      {t.preview ? (
                        <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-400">
                          prévia 30s
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-zinc-500">
                          assine
                        </span>
                      )}
                      <span className="w-10 shrink-0 text-right text-xs tabular-nums text-zinc-500">
                        {fmt(t.duration)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="mt-8 rounded-2xl border border-accent/30 bg-accent/10 p-5 text-center">
              <p className="text-sm text-zinc-200">
                Gostou? Assine o <b>TOQUE AGORA</b> e ouça tudo, sem limite de 30s.
              </p>
              <Link
                href="/"
                className="mt-3 inline-block rounded-full bg-accent px-6 py-2.5 text-sm font-bold text-black"
              >
                Assinar agora
              </Link>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
