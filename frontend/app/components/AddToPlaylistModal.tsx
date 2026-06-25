"use client";

import { useState } from "react";
import type { PlaylistSummary, Track } from "../lib/api";

interface Props {
  track: Track;
  playlists: PlaylistSummary[];
  onAdd: (playlistId: number) => void;
  onCreate: (name: string) => Promise<number>;
  onClose: () => void;
}

export default function AddToPlaylistModal({
  track,
  playlists,
  onAdd,
  onCreate,
  onClose,
}: Props) {
  const [name, setName] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-5 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm space-y-4 rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-lg font-bold">Adicionar a playlist</h2>
          <p className="truncate text-sm text-zinc-400">{track.display_name}</p>
        </div>

        <div className="max-h-60 space-y-1 overflow-y-auto">
          {playlists.length === 0 && (
            <p className="py-2 text-center text-sm text-zinc-500">
              Você ainda não tem playlists.
            </p>
          )}
          {playlists.map((pl) => (
            <button
              key={pl.id}
              onClick={() => onAdd(pl.id)}
              className="flex w-full items-center justify-between rounded-lg bg-white/5 px-3 py-2.5 text-left text-sm hover:bg-white/10"
            >
              <span className="truncate">{pl.name}</span>
              <span className="text-xs text-zinc-500">{pl.track_count}</span>
            </button>
          ))}
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const id = await onCreate(name.trim());
            onAdd(id);
          }}
          className="flex gap-2 border-t border-white/10 pt-3"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Criar nova playlist…"
            className="flex-1 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button className="rounded-lg bg-accent px-4 text-sm font-semibold text-black">
            Criar
          </button>
        </form>

        <button
          onClick={onClose}
          className="w-full rounded-full border border-white/10 py-2 text-sm text-zinc-300 hover:bg-white/5"
        >
          Fechar
        </button>
      </div>
    </div>
  );
}
