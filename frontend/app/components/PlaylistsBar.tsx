"use client";

import { useState } from "react";
import type { PlaylistSummary } from "../lib/api";
import { HeartIcon, PlayIcon, PlusIcon, ShareIcon } from "./icons";

interface Props {
  playlists: PlaylistSummary[];
  sharedPlaylists?: PlaylistSummary[];
  favCount: number;
  activeKey: string | null; // "fav" | `pl:${id}`
  onOpenFavorites: () => void;
  onOpenPlaylist: (pl: PlaylistSummary) => void;
  onOpenShared?: (pl: PlaylistSummary) => void;
  onShare?: (pl: PlaylistSummary) => void;
  onCreate: (name: string) => void;
  onDelete: (pl: PlaylistSummary) => void;
}

export default function PlaylistsBar({
  playlists,
  sharedPlaylists = [],
  favCount,
  activeKey,
  onOpenFavorites,
  onOpenPlaylist,
  onOpenShared,
  onShare,
  onCreate,
  onDelete,
}: Props) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold">Suas playlists</h2>
        <button
          onClick={() => setCreating((c) => !c)}
          className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium hover:bg-white/20"
        >
          <PlusIcon className="h-3.5 w-3.5" /> Nova
        </button>
      </div>

      {creating && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              onCreate(name.trim());
              setName("");
              setCreating(false);
            }
          }}
          className="flex gap-2"
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome da playlist"
            className="flex-1 rounded-lg border border-white/10 bg-surface/80 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button className="rounded-lg bg-accent px-4 text-sm font-semibold text-black">
            Criar
          </button>
        </form>
      )}

      <div className="flex flex-wrap gap-2">
        {/* Curtidas */}
        <button
          onClick={onOpenFavorites}
          className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
            activeKey === "fav" ? "bg-accent text-black" : "bg-white/5 hover:bg-white/10"
          }`}
        >
          <HeartIcon className="h-4 w-4" filled />
          Curtidas
          <span className="opacity-70">{favCount}</span>
        </button>

        {playlists.map((pl) => (
          <div
            key={pl.id}
            className={`group flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
              activeKey === `pl:${pl.id}` ? "bg-accent text-black" : "bg-white/5 hover:bg-white/10"
            }`}
          >
            <button onClick={() => onOpenPlaylist(pl)} className="flex items-center gap-2">
              <PlayIcon className="h-3.5 w-3.5" />
              {pl.name}
              <span className="opacity-70">{pl.track_count}</span>
            </button>
            {onShare && (
              <button
                onClick={() => onShare(pl)}
                className="opacity-0 transition group-hover:opacity-100 hover:text-accent"
                aria-label="Compartilhar playlist"
                title="Compartilhar"
              >
                <ShareIcon className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={() => onDelete(pl)}
              className="opacity-0 transition group-hover:opacity-100 hover:text-red-500"
              aria-label="Excluir playlist"
              title="Excluir playlist"
            >
              ✕
            </button>
          </div>
        ))}

        {sharedPlaylists.map((pl) => (
          <button
            key={`shared-${pl.id}`}
            onClick={() => onOpenShared?.(pl)}
            className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm transition-colors ${
              activeKey === `pl:${pl.id}` ? "bg-accent text-black" : "bg-white/5 hover:bg-white/10"
            }`}
            title={pl.owner_email ? `Compartilhada por ${pl.owner_email}` : undefined}
          >
            <ShareIcon className="h-3.5 w-3.5 opacity-70" />
            {pl.name}
            <span className="opacity-70">{pl.track_count}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
